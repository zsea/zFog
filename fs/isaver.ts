import fs from "fs/promises"
import { INode, INodeProperty, INodeSerializer } from "./inode";
import JSONBig from "json-bigint"
import { logger } from "../logger";
export interface INodeSaver {
    SaveInodes(inodes: { [path: string]: INodeProperty }, current?: {
        event: "created" | "changed" | "deleted", path: string, inode: INode
    }): Promise<void | undefined>
    LoadInodes(): Promise<{ timestamp: number, inodes: { [path: string]: INodeSerializer } }>
}
export abstract class FullSaver implements INodeSaver {
    protected _saver_write(content: string): Promise<void | undefined> {
        return Promise.resolve();
    }
    protected _saver_read(): Promise<string | undefined> {
        return Promise.resolve(undefined);
    }
    SaveInodes(inodes: { [path: string]: INodeProperty }, current?: {
        event: "created" | "changed" | "deleted", path: string, inode: INode
    }): Promise<void | undefined> {

        let _inodes: { [path: string]: INode } = {};
        for (let path in inodes) {
            _inodes[path] = inodes[path].inode;
        }
        let content: string = JSONBig.stringify({
            timestamp: Date.now(),
            inodes: _inodes
        });
        return this._saver_write(content);
    }
    LoadInodes(): Promise<{ timestamp: number, inodes: { [path: string]: INodeSerializer } }> {
        return this._saver_read().then((s: string | undefined) => {
            if (!s) return {
                timestamp: 0,
                inodes: {}
            };
            return JSONBig.parse(s) as { timestamp: number, inodes: { [path: string]: INodeSerializer } };
        });
    }
}
export class LocalSaver extends FullSaver {
    constructor(private fullFilename: string) {
        super();
    }
    protected _saver_write(content: string): Promise<void | undefined> {
        return fs.writeFile(this.fullFilename, content);
    }
    protected _saver_read(): Promise<string | undefined> {
        return fs.readFile(this.fullFilename, { encoding: "utf8" }).catch(e => {
            return undefined;
        }).then(s => s);
    }
}
export class ArraySaver implements INodeSaver {
    SaveInodes(inodes: { [path: string]: INodeProperty; }, current?: { event: "created" | "changed" | "deleted"; path: string; inode: INode; } | undefined): Promise<void | undefined> {
        
        return Promise.all(this.saverList.map(s => s.SaveInodes(inodes, current))).then(() => { })
    }
    LoadInodes(): Promise<{ timestamp: number, inodes: { [path: string]: INodeSerializer } }> {
        return Promise.all(this.saverList.map(s => s.LoadInodes())).then(list => {
            let v: { timestamp: number, inodes: { [path: string]: INodeSerializer } } | undefined;
            for (let i = 0; i < list.length; i++) {
                if(!v){
                    v=list[i];
                    continue;
                }
                if(v.timestamp<list[i].timestamp){
                    v=list[i];
                }
            }
            if (!v) {
                return {
                    timestamp: 0,
                    inodes: {}
                };
            }
            return v;
        })
    }
    private saverList: INodeSaver[] = [];
    Add(saver:INodeSaver){
        this.saverList.push(saver);
    }
}
export class MemorySaver extends FullSaver{
    private content?:string
    protected _saver_write(content: string): Promise<void | undefined> {
        this.content=content;
        return Promise.resolve();
    }
    protected _saver_read(): Promise<string | undefined> {
        return Promise.resolve(this.content);
    }
}