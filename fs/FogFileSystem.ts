/// <reference path="../d/snowflake.d.ts" />
import {
    LocalPropertyManager,
    LastModifiedDateInfo,
    FileSystemSerializer,
    OpenWriteStreamInfo,
    PropertyManagerInfo,
    OpenReadStreamInfo,
    IPropertyManager,
    LocalLockManager,
    CreationDateInfo,
    LockManagerInfo,
    SimpleCallback,
    ReturnCallback,
    ResourceType,
    ILockManager,
    ReadDirInfo,
    CreateInfo,
    DeleteInfo,
    FileSystem,
    SizeInfo,
    TypeInfo,
    MoveInfo
} from '@zsea/webdav-server/lib/manager/v2/fileSystem/export'
import { Readable, Writable } from 'stream'
import { RequestContext } from '@zsea/webdav-server/lib/server/v2/RequestContext'
import { Errors } from '@zsea/webdav-server/lib/Errors'
import { Path } from '@zsea/webdav-server/lib/manager/v2/Path'
import AsyncLock from "async-lock"

import { INode, INodeManager } from "./inode"
import { logger } from "../logger"

class NoneSerializer implements FileSystemSerializer {
    uid(): string {
        return 'NoneFSSerializer-1.0.0';
    }
    constructor() {

    }
    serialize(fs: FogFileSystem, callback: ReturnCallback<any>): void {
        callback();

    }

    unserialize(serializedData: any, callback: ReturnCallback<FileSystem>): void {
        callback()
    }
}

class FogReadable extends Readable {

    constructor(private inode: INode) {
        super();
    }
    private _count: number = 0;
    async _read(size: number) {
        if (this._count >= this.inode.blockManager.blocks.length) {
            this.push(null);
            return;
        }
        try {
            let content = await this.inode.blockManager.ReadBlock(this._count++);
            this.push(content);
        }
        catch (e: any) {
            this.emit("error", e);
            logger.error("读取数据失败", e);
            return;
        }
        if (this._count >= this.inode.blockManager.blocks.length) {
            this.push(null);
            return;
        }
    }
}
class FogWritable extends Writable {
    constructor(private inode: INode, private blockSize: number) {
        super();
    }
    private _size: number = 0;
    private _blockIndex: number = 0;
    private _cached: Buffer | undefined;
    public get size(): number {
        return this._size;
    }
    private __write__(chunks: {
        buffer: Buffer,
        index: number
    }[], callback: (error?: Error | null | undefined) => void) {
        Promise.all(chunks.map(item => Promise.resolve(item).then(item => {
            return this.inode.blockManager.WriteBlock(item.index, item.buffer)
        }))).then((count) => {
            if(count.includes(0)){
                return callback(Errors.InsufficientStorage)
            }
            callback(Errors.None);
        }).catch(e => {
            callback(Errors.Forbidden)
            logger.error("写入流失败", e);
        });
    }
    _write(chunk: Buffer, encoding: string, callback: (error?: Error | null | undefined) => void) {
        this._size += chunk.length;
        let chunks: {
            buffer: Buffer,
            index: number
        }[] = [];
        let contents: Buffer = this._cached ? Buffer.concat([this._cached, chunk]) : chunk;
        this._cached = undefined;
        for (let i = 0; i < contents.length; i = i + this.blockSize) {
            let tmp = contents.subarray(i, i + this.blockSize);
            if (tmp.length < this.blockSize) {
                this._cached = tmp;
            }
            else {
                chunks.push({
                    buffer: tmp,
                    index: this._blockIndex++
                });
            }

        }
        this.__write__(chunks, callback);
    }
    _final(callback: (error?: Error | null | undefined) => void): void {
        
        if (this._cached&&this._cached.length) {
            this.__write__([{
                buffer: this._cached,
                index: this._blockIndex++
            }], (e) => {
                this._cached = undefined;
                callback(e);
            });
        }
        else{
            this._cached = undefined;
        }
    }
}

export class FogFileSystem extends FileSystem {

    private locker: AsyncLock = new AsyncLock()
    constructor(public inodeManager: INodeManager, private blockSize: number = 4096) {
        super(new NoneSerializer());

    }

    getSize(path:string):number{
        return Number(this.inodeManager.getSize(path));
    }

    protected _fastExistCheck(ctx: RequestContext, path: Path, callback: (exists: boolean) => void): void {
        this.inodeManager.getINode(path.toString())
        return callback(this.inodeManager.getINode(path.toString()) !== undefined);
    }

    protected _create(path: Path, ctx: CreateInfo, callback: SimpleCallback): void {

        let file = this.inodeManager.getINode(path.toString());
        if (file !== undefined) {
            return callback(Errors.ResourceAlreadyExists);
        }
        try {
            this.inodeManager.createINode(path.toString(), ctx.type === ResourceType.File ? "file" : "dir");
            callback();
            
        }
        catch (e) {
            logger.error("创建文件失败", e);
            return callback(Errors.Forbidden);
            //return;
        }
        //callback();
    }

    protected _delete(path: Path, ctx: DeleteInfo, callback: SimpleCallback): void {

        let inode = this.inodeManager.getINode(path.toString());
        if (!inode) {
            return callback(Errors.ResourceNotFound);
        }
        //TODO：添加文件删除互斥锁，与写入使用相同的锁（key）
        this.locker.acquire(path.toString(), (done) => {
            this.inodeManager.removeINode(path.toString()).then(() => {
                return callback();
            }).catch((e: any) => {
                if (e.message === "NotFound") {
                    return callback(Errors.ResourceNotFound);
                }
    
                logger.error("删除文件失败", e);
                return callback(Errors.Forbidden);
            }).finally(()=>{
                done();
            })
        })


        
        //return callback();

    }

    protected _openWriteStream(path: Path, ctx: OpenWriteStreamInfo, callback: ReturnCallback<Writable>): void {
        let inode = this.inodeManager.getINode(path.toString());
        if (!inode) {
            return callback(Errors.ResourceNotFound);
        }
        //TODO：添加文件写入互斥锁
        this.locker.acquire(path.toString(), (done) => {
            if(!inode){
                done();
                return;
            }
            
            let writer = new FogWritable(inode.inode, this.blockSize);
            writer.on("finish", () => {
                if (!inode) {
                    done();
                    return;
                }
                
                inode.inode.size = BigInt(writer.size);
                inode.inode.mtime = Date.now();
                this.inodeManager.onChanged("changed", path.toString(), inode.inode);
                done();
            });
            writer.on("error",(e)=>{
                logger.error(`写入文件 ${path.toString()} 错误 `,e);
                done(e);
            })
            // 最后一次打开的时间变更不触发inode保存，但会随着其它属性的变更而一起保存
            inode.inode.atime = Date.now();
            return callback(undefined, writer);
        })
        //logger.debug(path.toString(),inode.inode.id)
        //logger.debug(path.toString())
        

    }

    protected _openReadStream(path: Path, ctx: OpenReadStreamInfo, callback: ReturnCallback<Readable>): void {

        let inode = this.inodeManager.getINode(path.toString());
        if (!inode) {
            return callback(Errors.ResourceNotFound);
        }
        // 最后一次打开的时间变更不触发inode保存，但会随着其它属性的变更而一起保存
        inode.inode.atime = Date.now();
        return callback(undefined, new FogReadable(inode.inode));
    }

    protected _size(path: Path, ctx: SizeInfo, callback: ReturnCallback<number>): void {
        let inode = this.inodeManager.getINode(path.toString());
        if (!inode) {
            return callback(Errors.ResourceNotFound);
        }
        return callback(undefined, Number(inode.inode.size));
        //this.getPropertyFromResource(path, ctx, 'size', callback);
    }

    protected _lockManager(path: Path, ctx: LockManagerInfo, callback: ReturnCallback<ILockManager>): void {
        //this.getPropertyFromResource(path, ctx, 'locks', callback);
        let inode = this.inodeManager.getINode(path.toString());
        if (!inode) {
            return callback(Errors.ResourceNotFound);
        }
        return callback(undefined, inode.locks);
    }

    protected _propertyManager(path: Path, ctx: PropertyManagerInfo, callback: ReturnCallback<IPropertyManager>): void {
        //this.getPropertyFromResource(path, ctx, 'props', callback);
        let inode = this.inodeManager.getINode(path.toString());
        if (!inode) {
            return callback(Errors.ResourceNotFound);
        }
        return callback(undefined, inode.props);
    }

    protected _readDir(path: Path, ctx: ReadDirInfo, callback: ReturnCallback<string[] | Path[]>): void {
        //callback(undefined, this.resourceManager.GetChildren(path));
        let inode = this.inodeManager.getINode(path.toString());
        if (!inode) {
            return callback(Errors.ResourceNotFound);
        }
        let children = this.inodeManager.getChildren(path.toString());
        callback(undefined, children);
    }
    protected _creationDate(path: Path, ctx: CreationDateInfo, callback: ReturnCallback<number>): void {

        let inode = this.inodeManager.getINode(path.toString());
        if (!inode) {
            return callback(Errors.ResourceNotFound);
        }
        return callback(undefined, inode.inode.ctime);
        //this.getPropertyFromResource(path, ctx, 'creationDate', callback);
    }

    protected _lastModifiedDate(path: Path, ctx: LastModifiedDateInfo, callback: ReturnCallback<number>): void {
        let inode = this.inodeManager.getINode(path.toString());
        if (!inode) {
            return callback(Errors.ResourceNotFound);
        }
        return callback(undefined, inode.inode.mtime);
        //this.getPropertyFromResource(path, ctx, 'lastModifiedDate', callback);
    }

    protected _type(path: Path, ctx: TypeInfo, callback: ReturnCallback<ResourceType>): void {
        //this.getPropertyFromResource(path, ctx, 'type', callback);
        let inode = this.inodeManager.getINode(path.toString());
        if (!inode) {
            return callback(Errors.ResourceNotFound);
        }
        return callback(undefined, inode.inode.type === "file" ? ResourceType.File : ResourceType.Directory);
    }


    protected _move(pathFrom: Path, pathTo: Path, ctx: MoveInfo, callback: ReturnCallback<boolean>): void {


        this.inodeManager.moveINode(pathFrom.toString(), pathTo.toString(), ctx.overwrite).then(() => {
            callback(undefined, true);
        }).catch((e: any) => {
            if (e.message === "NotFound") {
                return callback(Errors.ResourceNotFound);

            }
            else if (e.message === "AlreadyExists") {
                return callback(Errors.ResourceAlreadyExists);
            }
            logger.error("移动文件失败", e);
            return callback(Errors.Forbidden);
        })


    }
}