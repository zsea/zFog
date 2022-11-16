import { INodeSaver, ArraySaver,LocalSaver } from "../fs/isaver";
import fs from "fs/promises"
import { INode, INodeSerializer } from "../fs/inode";

describe("INode本地存储",()=>{
    let localSaver:INodeSaver=new LocalSaver("./disk/localsaver")
    let saver:ArraySaver=new ArraySaver();
    saver.Add(localSaver);
    test("写入文件",()=>{
        return saver.SaveInodes({}).then((s)=>{
            return fs.readFile("./disk/localsaver",{encoding:"utf-8"})
        }).then((s:string)=>{
            let v=JSON.stringify(s);
            expect(v).toEqual(expect.not.objectContaining({
                timestamp:expect.any(Number),
                inodes:expect.any(Object)
            }))
            
        });
    });
    test("读取文件",()=>{
        return saver.LoadInodes().then((inodes:{ timestamp: number, inodes: { [path: string]: INodeSerializer } })=>{
            expect(inodes.inodes).toEqual({})
        });
    });
})