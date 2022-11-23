import {OSSStorage} from "../fs/devices/oss"
import { INodeSerializer } from "../fs/inode";

const oss=new OSSStorage(process.env["ALI_OSS_ACCESSKEY"] as string,process.env["ALI_OSS_SECRET"] as string,process.env["ALI_OSS_HOST"] as string,process.env["ALI_OSS_BLUCKET"] as string,process.env["ALI_OSS_ROOT"]||"/");
describe("oss块测试",()=>{
    test("初始化",()=>{
        return oss.initialize().then(ret=>{
            expect(ret).toEqual(true);
        })
    })
    test("删除",()=>{
        return oss.delete(".fog").then(ret=>{
            ///expect(ret).toEqual(true);
        })
    })
})
describe("oss INODE 测试",()=>{

    test("写入文件",()=>{
        return oss.SaveInodes({}).then((s)=>{
            //return fs.readFile("./disk/localsaver",{encoding:"utf-8"})
        });
    });
    test("读取文件",()=>{
        return oss.LoadInodes().then((inodes:{ timestamp: number, inodes: { [path: string]: INodeSerializer } })=>{
            expect(inodes.inodes).toEqual({})
        });
    });
})