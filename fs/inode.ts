import { IStorage, StorageManager } from "./storage"
import {
    LocalPropertyManager,
    LocalLockManager,
} from '@zsea/webdav-server/lib/manager/v2/fileSystem/export'
import { crc16 } from "easy-crc"
import { Random } from "./random"
import { logger } from "../logger"
import { ICrypto, NoneCrypto,CryptoManager } from "./icrypto"
import { INodeSaver, MemorySaver } from "./isaver"
import { Parallelizer } from "./parallelizer"
import path from "./path"

const snowflake = require("@zsea/snowflake")

export interface BlockContent {
    /**
     * 存器ID
     */
    id: string
    /**
     * 内容，这里的内容是交给存储器读取的内容，由存储器通过处理后转换为buffer
     */
    content: string
    /**
     * 存储器类型，用于存储器判断当前块是否应该由自己读取
     */
    type: string
}
export interface Block {
    /**
     * CRC32校验，用于校验存储器读取的内容是否正确
     */
    crc32: number
    contents: BlockContent[]
    /**
     * 加密器ID，方便在后期添加新的加密器而不影响前期数据解密
     */
    crypto:string
}
/**
 * 对数据块进行管理
 */
export class BlockManager {
    public blocks: Block[] = [];

    /**
     * 循环分配存储器块的计数器
     */
    private cycleIndex: number = 0;
    /**
     * 写入数据时，是否优先使用旧数据所在的存储器
     */
    private overrideFirst: boolean = true;

    /**
     * 追加数据到最后
     * @param input 
     */
    public async AppendBlock(input: Buffer): Promise<number> {
        return this.WriteBlock(this.blocks.length, input);
    }
    /**
     * 写入一个数据块
     * @param index 数据块索引号
     * @param input 
     * @return 写入的数据块个数
     */
    public async WriteBlock(index: number, input: Buffer): Promise<number> {

        let crc32: number = crc16("MODBUS", input);
        let crypto:ICrypto=this.cryptoManager.cryptos[0];
        let encryptoContent: Buffer = await crypto.encrypt(input);
        let returnValue: number = 0;
        let newBlocks: BlockContent[] = []
        /**
         * 每次写入数据的时候，在调用存储器时，块名称（可随机或按一定规律生成），由存储器判断是否删除原来的内容再写入
         * 
         * 写入流程：
         *     1. 判断当前索引是否有原来的数据块
         *     2. 根据配置（随机分配、循环分配、优先利用旧的存储器）获取要写入的存储器名称列表
         *     3. 写入数据块
         *     4. 判断是否有写入失败的存储器，若有，则跳转到3，若没有失败则跳转到5
         *     5. 判断是否有多余的存储器上存储的数据（如原来存储份数为5，现在重新设置为2，则在重新写数据后，会有多余的2个存储器没有数据写入），有则调用删除
         *     6. 结束，返回实际写入的存储器数量
         */
        let idList: string[] = this.storageManager.Find("canWrite");

        let originIndex: number = 0;

        while (idList.length && returnValue < this.maxStorage) {
            let selector: {
                id: string,
                storager: IStorage,
                origin?: string
            }[] = [];

            for (let i = returnValue; i < this.maxStorage || (this.mode === "all" && idList.length > 0); i++) {
                let id: string | undefined;
                let originContent: string | undefined;
                if (this.overrideFirst && this.blocks[index] && originIndex < this.blocks[index].contents.length) {
                    //重写优先
                    let block = this.blocks[index].contents[originIndex++];

                    if (block) {
                        let storager = this.storageManager.GetStorage(block.id);
                        if (storager && (storager.mode & 0b010) === 0b010) {
                            //原存储器可以写入
                            //id = block.id;
                            //originContent = block.content;
                            selector.push({
                                id: block.id,
                                storager: storager,
                                origin: block.content
                            })
                            idList = idList.filter(p => p !== block.id);
                            continue;
                        }
                    }
                }

                //根据随机或者循环读取名称
                if (this.mode === "random") {
                    let idIndex = Random.rangeInt(0, idList.length);
                    id = idList[idIndex];
                }
                else if (this.mode === "cycle") {
                    //循环读取
                    if (this.cycleIndex >= idList.length) {
                        this.cycleIndex = 0;
                    }
                    id = idList[this.cycleIndex++];
                }
                else if (this.mode === "all") {
                    id = idList[0];
                }
                if (!id) break;

                let storager = this.storageManager.GetStorage(id);
                if (storager && (storager.mode & 0b010) === 0b010) {
                    // //当前存储器可写
                    selector.push({
                        id: id,
                        storager: storager,
                        origin: originContent
                    })
                    idList = idList.filter(p => p !== id);

                    continue;
                }

            }
            let tasks = selector.map(item => Promise.resolve(item).then(function (item) {
                //TODO:[V] 写入后添加数据校验，确认定入数据正确
                return item.storager.save(encryptoContent, item.origin).then((name) => {
                    // return item.storager.read(name).then((buf)=>{
                    //     if(buf.equals(encryptoContent)){
                    //         return name;
                    //     }
                    //     throw new Error("WriteCRCError");
                    // })
                    //return name;
                    return name;
                })
            }).then(function (cnt) {
                return {
                    content: cnt,
                    //name:item.name,
                    id: item.id,
                    type: item.storager.type,
                    //crc32: crc32,

                }
            }).then(function (block: BlockContent) {
                //if(item.origin)
                //block.content
                return block;
            }).catch(e => {
                //logger.error(e);
                logger.error(`${item.id}/${item.storager.type} 写入数据失败 ${e.message}`);
            })
            )
            let saveResult = await Promise.all(tasks);
            saveResult = saveResult.filter(p => !!p);
            saveResult.forEach(p => {
                newBlocks.push(p as BlockContent);
                returnValue += 1;
            })
        }
        let waitRemoveBlocks: BlockContent[] = [];
        this.blocks[index] && this.blocks[index].contents.every(p => {
            if (!newBlocks.some(n => n.id === p.id)) {
                waitRemoveBlocks.push(p);
            }
        });
        //将新数据添加到链中
        this.blocks[index] = {
            contents: newBlocks,
            crc32: crc32,
            crypto:crypto.id
        }

        //删除原来有，但现在没有使用的块
        let tasks = waitRemoveBlocks.map(p => Promise.resolve(p).then((item) => {
            let storage = this.storageManager.GetStorage(item.id);
            if (storage) {
                return storage.delete(item.content);
            }
        }).catch(e => {
            logger.warn(`删除数据 ${p.id}/${p.type}/${p.content} 失败，错误描述：${e.message}`);
        }));
        await Promise.all(tasks)

        return returnValue;

    }
    /**
     * 读取一个数据块
     * @param index 数据块索引号
     */
    public async ReadBlock(index: number): Promise<Buffer> {
        /**
         * 从任意一个块中读取数据即可
         */
        let blocks = this.blocks[index];
        if (!blocks) throw new Error("NotFound");
        let crypto=this.cryptoManager.getCrypto(blocks.crypto);
        if(!crypto) throw new Error("NotCryptor");
        let sContent: Buffer | undefined = undefined;
        for (let i = 0; i < blocks.contents.length; i++) {
            let storager = this.storageManager.GetStorage(blocks.contents[i].id);
            if (storager && storager.type === blocks.contents[i].type) {
                try {
                    let tContent = await storager.read(blocks.contents[i].content);
                    tContent = await crypto.decrypt(tContent);
                    let crc32: number = crc16("MODBUS", tContent);
                    if (crc32 !== this.blocks[index].crc32) {
                        logger.error(`从 ${storager.type}/${storager.id} CRC校验失败，计算值：${crc32}，期望值：${this.blocks[index].crc32}`);
                        continue;
                    }
                    sContent = tContent;
                    break;
                }
                catch (e: any) {
                    logger.error(`从 ${storager.type}/${storager.id} 读取内容失败：${e.message}`);
                }
            }
        }
        if (!sContent) {
            throw new Error("NotFound");
        }

        return sContent;
    }
    /**
     * 删除数据块，删除的时候，需要删除对应的存储实体
     * @param index 数据块索引号
     * @param id 存储器id
     */
    public async DeleteBlock(index: number, id?: string): Promise<void> {
        // TODO: [V] 实现数据块的删除
        if (!id) {
            while (this.blocks[index].contents.length) {
                await this.DeleteBlock(index, this.blocks[index].contents[0].id);
            }
        }
        else {
            for (let i = 0; i < this.blocks[index].contents.length; i++) {
                if (this.blocks[index].contents[i].id === id) {
                    await this.storageManager.GetStorage(id)?.delete(this.blocks[index].contents[i].content);
                }
            }
            this.blocks[index].contents = this.blocks[index].contents.filter(p => p.id !== id);
        }
    }

    /**
     * 删除所有数据块，一般用于从上层调用删除文件
     */
    public async Free() {
        for (let i = 0; i < this.blocks.length; i++) {
            await this.DeleteBlock(i);
        }
    }
    /**
     * 
     * @param storageManager 
     * @param maxStorage 每个数据块，存储几份（每一份存储在不同的地方）
     * @param mode 存储模式
     */
    constructor(private storageManager: StorageManager, private maxStorage: number = 1, private mode: "random" | "cycle" | "all" = "random", private cryptoManager:CryptoManager=new CryptoManager([new NoneCrypto("")])) {

    }
    public toJSON(): string {
        return JSON.stringify(this.blocks);
    }
}

export class INode {

    private _id: bigint = 0n;
    private _size: bigint = 0n
    private _uid: number | null | undefined = 0;
    private _gid: number | null | undefined = 0;
    private _mode: number = 0;
    private _ctime: number = 0;
    private _mtime: number = 0;
    private _atime: number = 0;
    private _links: number = 0;
    private _type: "file" | "dir" = "file";
    private _blockManager: BlockManager;

    public get size(): bigint {
        return this._size;
    }
    public set size(v: bigint) {
        this._size = v;
    }

    public get uid(): number | undefined | null {
        return this._uid
    }
    public set uid(v: number | undefined | null) {
        this._uid = v;
    }

    public get gid(): number | null | undefined {
        return this._gid;
    }
    public set gid(v: number | undefined | null) {
        this._gid = v;
    }

    public get mode(): number {
        return this._mode;
    }
    public set mode(v: number) {
        this._mode = v;
    }

    public get ctime(): number {
        return this._ctime;
    }
    public set ctime(v: number) {
        this._ctime = v;
    }

    public get mtime(): number {
        return this._mtime;
    }
    public set mtime(v: number) {
        this._mtime = v;
    }

    public get atime(): number {
        return this._atime;
    }
    public set atime(v: number) {
        this._atime = v;
    }

    public get links(): number {
        return this._links;
    }
    public set links(v: number) {
        this._links = v;
        //this._blockManager
    }

    public get id(): bigint {
        return this._id;
    }
    public set id(v: bigint) {
        this._id = v;
    }

    public get type(): "file" | "dir" {
        return this._type;
    }
    public set type(v: "file" | "dir") {
        this._type = v;
    }

    public get blockManager(): BlockManager {
        return this._blockManager;
    }

    /**
     * 
     * @param inodeManager inode的管理器，主要用于当前inode变化时，通知道管理器进行保存等操作
     * @param storageManager 向下传递给blockManager，用于实际数据的存储、删除等操作
     * @param maxStorage 最大存储份数
     * @param mode 存储模式
     */
    //constructor(private inodeManager: INodeManager, private storageManager: StorageManager, maxStorage: number, mode: "random" | "cycle", crypto: ICrypto, origin?: INodeSerializer) {
    constructor(private inodeManager: INodeManager, blockManager: BlockManager, origin?: INodeSerializer) {
        //this._blockManager = new BlockManager(storageManager, maxStorage, mode, crypto)
        this._blockManager = blockManager;
        if (origin) {
            this._atime = origin.atime;
            this._ctime = origin.atime;
            this._gid = origin.gid;
            this._id = origin.id;
            this._links = origin.links;
            this._mode = origin.mode;
            this._mtime = origin.mtime;
            this._size = origin.size;
            this._type = origin.type;
            this._uid = origin.uid;
            this.blockManager.blocks = origin.blocks;
        }
        else {
            this._ctime = Date.now();
            this._id = INode.idWork.nextId() as bigint;
            this._mtime = this._ctime;
            this._atime = 0;
            this._gid = 0;
            this._links = 0;
            this._mode = 0;
            this._size = 0n;
            this._type = "file";
            this._uid = 0;
        }
    }

    private static idWork = new snowflake();
    public toJSON() {
        let json: INodeSerializer = {
            type: this.type,
            id: this.id,
            size: this.size,
            uid: this.uid,
            gid: this.uid,
            mode: this.mode,
            ctime: this.ctime,
            mtime: this.mtime,
            atime: this.atime,
            links: this.links,
            blocks: this.blockManager.blocks
        }
        return json;
    }
}
export interface INodeSerializer {
    type: "file" | "dir",
    id: bigint,
    size: bigint,
    uid: number | null | undefined,
    gid: number | null | undefined,
    mode: number,
    ctime: number,
    mtime: number,
    atime: number,
    links: number,
    blocks: Block[]
}
export interface INodeProperty {
    inode: INode,
    props: LocalPropertyManager
    locks: LocalLockManager,
}
export class INodeManager {
    private inodes: {
        [path: string]: INodeProperty
    } = {};
    private saverTask: Parallelizer = new Parallelizer(1)
    constructor(private blockManagerFactory: () => BlockManager, private saver: INodeSaver = new MemorySaver()) {

    }
    initialize(): Promise<boolean> {
        return this.saver.LoadInodes().then(v => {
            for (let path in v.inodes) {
                this.inodes[path] = {
                    inode: new INode(this, this.blockManagerFactory(), v.inodes[path]),
                    props: new LocalPropertyManager(),
                    locks: new LocalLockManager()
                }
            }
            if (!this.inodes["/"]) {
                this.createINode("/", "dir");
            }

            return true;
        })
    }
    createINode(path: string, type: "file" | "dir" = "file"): INode {
        let inode = new INode(this, this.blockManagerFactory());
        inode.type = type;
        this.inodes[path] = {
            inode: inode,
            props: new LocalPropertyManager(),
            locks: new LocalLockManager()
        };
        //inode.mtime=Date.now()
        this.onChanged("created", path, inode);
        return inode;
    }
    /**
     * 
     * @param inode 触发修改事件，用于保存
     */
    onChanged(event: "created" | "changed" | "deleted", path: string, inode: INode) {
        this.saverTask.execute(() => {
            return this.saver.SaveInodes(this.inodes, { event: event, path: path, inode: inode });
        });
    }
    /**
     * 查找文件
     * @param path 
     * @returns 
     */
    getINode(path: string): INodeProperty | undefined {
        return this.inodes[path];
    }
    /**
     * 
     * @param path 查找列表
     * @returns 
     */
    getChildren(path: string): string[] {
        let base: string = path;
        if (!base.endsWith("/")) base += "/";
        let children: string[] = Object.keys(this.inodes).filter(p => p !== base && p.startsWith(base) && /^[^\/]+(\/){0,1}$/ig.test(p.replace(base, "")));
        return children;
    }
    /**
     * 删除文件
     * @param path 
     * @param deleteEntity - 是否删除文件实体块
     * @param cascade - 是否级联删除
     */
    async removeINode(path: string, deleteEntity: boolean = true, cascade: boolean = true): Promise<INodeProperty> {

        let inode: INodeProperty | undefined = this.getINode(path);
        if (!inode) {
            throw new Error("NotFound");
        }
        if (inode.inode.type === "file" && deleteEntity) {
            await inode.inode.blockManager.Free();

        }
        else if (inode.inode.type === "dir" && cascade) {
            let children = this.getChildren(path);
            if (children) {
                for (let child of children) {
                    await this.removeINode(child, deleteEntity);
                }
            }

        }
        delete this.inodes[path];
        this.onChanged("deleted", path, inode.inode);
        return inode;
    }
    /**
     * 移动文件
     * @param from - 源路径
     * @param to - 目的路径
     * @param overwrite - 目的路径中存在文件时，是否覆盖
     * @returns 
     */
    async moveINode(from: string, to: string, overwrite: boolean = false): Promise<INodeProperty> {
        let _from = this.getINode(from), _to = this.getINode(to);
        if (!_from) {
            throw new Error("NotFound");
        }

        if (_to && !overwrite) {
            throw new Error("AlreadyExists");
        }
        if (_from.inode.type === "dir") {
            //采用深度优先遍历
            let children = this.getChildren(from);
            for (let i = 0; i < children.length; i++) {

                let name = path.basename(children[i]);
                let nPath = path.join([to, name]);
                await this.moveINode(children[i], nPath);
            }
            //return ino
        }
        return this.removeINode(from, false, false).then(inode => {
            this.inodes[to] = inode;
            this.onChanged("created", to, inode.inode);
            return inode;
        });


    }
    /**
     * 获取指定路所占空间
     * @param path 
     */
    getSize(path: string): bigint {
        let inode: INodeProperty | undefined = this.getINode(path);
        if (!inode) {
            throw new Error("NotFound");
        }
        if (inode.inode.type === "file") {
            return inode.inode.size
        }
        else if (inode.inode.type === "dir") {
            let total: bigint = 0n;
            let children = this.getChildren(path);
            if (children) {
                for (let child of children) {
                    total += this.getSize(child)
                }
            }
            return total;
        }
        return -1n

    }
}
