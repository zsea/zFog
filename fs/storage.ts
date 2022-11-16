import fs from "fs/promises"
import path from "path"
import { v4 as UUIDV4, NIL as NIL_UUID } from "uuid"
import { logger } from "../logger"
const snowflake = require("@zsea/snowflake")
export interface IStorage {
    read(content: string): Promise<Buffer>
    /**
     * 存储数据
     * @param buffer - 需要保存的内容
     * @param origin - 原来保存的内容，存储器可以根据这个来确定原来保存的位置，进行覆盖操作，也可以不覆盖，进行新的写入
     */
    save(buffer: Buffer, origin?: string): Promise<string>
    delete(content: string): Promise<void>
    /**
     * 获取存储器类型，主要在读取数据时需要判断
     */
    get type(): string
    //权限数字：0b111，从左到右，第1位：读的权限，第二位：写的权限，第三位：删除的权限
    get mode(): number
    set mode(v:number);
    //TODO: [V] 考虑对存储器使用唯一ID
    get id(): string
    //TODO: [V] 增加初始化方法，用于初始化存储的相关信息，比如生成ID等
    initialize(): Promise<boolean>
}
export class NullStorage implements IStorage {
    private _mode:number=7;
    get mode(): number {
        return this._mode;
    }
    set mode(v:number){
        this._mode=v;
    }
    get id(): string {
        return NIL_UUID
    }
    initialize(): Promise<boolean> {
        return Promise.resolve(true);
    }
    get type(): string {
        return "null"
    }
    read(content: string): Promise<Buffer> {
        return Promise.resolve(Buffer.alloc(Number(content)));
    }
    save(buffer: Buffer, origin?: string): Promise<string> {
        return Promise.resolve(buffer.length.toString());
    }
    delete(content: string): Promise<void> {
        return Promise.resolve();
    }

}

/**
 * 本地存储器，数据仅存储在本地磁盘目录下
 */
export class LocalStorage implements IStorage {
    private idWorker = new snowflake();
    private _id: string | undefined = undefined;
    read(content: string): Promise<Buffer> {
        let p = path.join(this.local, content);
        return fs.readFile(p);
    }
    save(buffer: Buffer, origin?: string | undefined): Promise<string> {
        let fileName = origin || this.idWorker.nextId().toString();
        let p = path.join(this.local, fileName);
        return fs.writeFile(p, buffer).then(function () {
            return fileName;
        });
    }
    delete(content: string): Promise<void> {
        let p = path.join(this.local, `${content}.del`);
        let f = path.join(this.local, content);
        return fs.writeFile(p, Date.now().toString()).then(function () {
            return fs.unlink(f).catch((e:any)=>{
                logger.error(`删除文件 ${f} 失败`);
            }).finally(function () {
                return fs.unlink(p);
            })

        });
        //return Promise.resolve();
    }
    get type(): string {
        return "local"
    }

    constructor(private local: string) {
        if (!local.endsWith("/")) local += "/"

    }
    private _mode:number=7;
    get mode(): number {
        return this._mode;
    }
    set mode(v:number){
        this._mode=v;
    }
    get id(): string {
        return this._id as string;
    }
    initialize(): Promise<boolean> {
        let p = path.join(this.local, `.fog`);
        return fs.readFile(p, "utf8").then((txt) => {
            return JSON.parse(txt);
        }).then((cfg) => {
            this._id = cfg.id
        }).catch(e => {
            if(e.code==="ENOENT"){
                return true;
            }
            throw e;
        }).then(() => {
            if (this._id) {
                return true;
            }
            else {
                let id: string = UUIDV4();
                return fs.writeFile(p, JSON.stringify({ id: id })).then(() => {
                    this._id = id;
                    return true;
                })
            }
        })
    }
}
export class StorageManager {
    private storages: {
        [id: string]: IStorage
    } = {}
    constructor() {

    }

    public Add(storage: IStorage) {
        //console.log("添加存储器",storage.id,storage.type)
        this.storages[storage.id] = storage;
    }
    public Remove(id: string) {
        delete this.storages[id];
    }

    public Length(): number {
        return Object.keys(this.storages).length;
    }
    /**
     * 读取所有可用存储器的名称
     * @param status - 处理器状态
     * @returns 
     */
    public Find(status: "canRead" | "canWrite" | "canDel" | "any" = "any"):string[]{
        let idList:string[]=[];
        
        for(let id in this.storages){
            if(!id||!id.length) continue;
            if (status === "canRead" && (this.storages[id].mode & 0b100) === 0b100){
                
                idList.push(id);
                continue;
            }
            else if (status === "canWrite" && (this.storages[id].mode & 0b010) === 0b010){
                
                idList.push(id);
                continue;
            }
            else if (status === "canDel" && (this.storages[id].mode & 0b001) === 0b001){
                
                idList.push(id);
                continue;
            }
            else{
                
                idList.push(id);
                continue;
            }
        }
        return idList;
    }
    public GetStorage(id: string): IStorage | undefined {
        return this.storages[id]
    }

}