import { QuarkStorage } from "../fs/devices/quark"
import { INodeSerializer } from "../fs/inode";

const quark = new QuarkStorage(process.env["QUARK_COOKIES"] as string, process.env["QUARK_ROOT"] as string);
describe("夸克块测试", () => {
    test("初始化", () => {
        return quark.initialize().then(ret => {
            //console.log(ret);
            expect(ret).toEqual(true);
        })
    })
    let fid:string=""
    test("保存数据块", () => {
        return quark.save(Buffer.from("quark", "utf-8"), "test.txt").then(ret => {
            fid=ret;
            //console.log(ret)
            expect(fid.length).toBeGreaterThanOrEqual(1)
        })
    })
    test("读取数据块", () => {
        return quark.read(fid).then(ret => {
            //console.log(ret);
            expect(ret.toString()).toEqual("quark");
        })
    })
    test("删除文件", () => {
        return quark.delete(fid)
    })
})
describe("夸克 INODE 测试", () => {

    test("写入文件",()=>{
        return quark.SaveInodes({});
    });
    test("读取文件",()=>{
        return quark.LoadInodes().then((inodes:{ timestamp: number, inodes: { [path: string]: INodeSerializer } })=>{
            expect(inodes.inodes).toEqual({})
        });
    });
})