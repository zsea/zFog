import {GiteeConfigure,GiteeStorage} from "../fs/devices/gitee"

describe("Gitee存储",()=>{
    let storager=new GiteeStorage(process.env["GITEE_ACCESSTOKEN"]||"",process.env["GITEE_OWNER"]||"",process.env["GITEE_REPO"]||"")
    test("测试初始化",()=>{
        return storager.initialize().then(v=>{
            expect(v).toBeTruthy()
        })
    })
    let blockId:string|undefined;
    test("写入数据块",()=>{
        return storager.save(Buffer.from("test data")).then(fileName=>{
            blockId=fileName;
            expect(fileName).not.toBeUndefined();
        })
    })
    test("读取数据",()=>{
        return storager.read(blockId as string).then((buf)=>{
            let content=buf.toString("utf8");
            expect(content).toEqual("test data");
        })
    })
    test("删除数据",()=>{
        return storager.delete(blockId as string).then(()=>{
            //console.log("删除成功",blockId);
        })
    })
    test("写入Inode",()=>{
        return storager.SaveInodes({}).then(()=>{})
    })
    test("读取Inode",()=>{
        return storager.LoadInodes().then(inodes=>{
            expect(inodes).toEqual(expect.objectContaining({
                timestamp:expect.any(Number),
                inodes:expect.any(Object)
            }))
        })
    })
});