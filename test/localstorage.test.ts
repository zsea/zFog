import { IStorage, LocalStorage } from "../fs/storage"
import fs from "fs/promises"
import path from "path"

let storeDir = path.join("./disk");
let storager: IStorage = new LocalStorage(storeDir);
describe("本地存储器", () => {
    test("初始化",()=>{
        return storager.initialize().then((result)=>{
            expect(result).toBeTruthy()
        })
    })
    test("是否包含ID",()=>{
        expect(storager.id).not.toBeUndefined()
    })
    test("可读测试", () => {
        expect(storager.mode & 0b100).toEqual(0b100);
    })
    test("写入第一个数据块", () => {
        return storager.save(Buffer.from("FogPan"), "1").then(function (name) {
            expect(name).toEqual("1");
        })
    })
    test("读取第一个数据块", () => {
        return storager.read("1").then(function (content: Buffer) {
            expect(content.toString("utf-8")).toEqual("FogPan");
        })
    })
    test("删除第一个数据块", () => {
        return storager.delete("1").then(function () {
            let p = path.join(storeDir, "1.del");
            fs.access(p).then(function () {
                expect(true).toEqual(false);
            }).catch(e => {
                expect(e.code).toEqual("ENOENT");
            })

        })
    })
    test("不指定数据块名称写入", () => {
        return storager.save(Buffer.from("FogPan")).then(function (name) {
            expect(name).not.toBeUndefined()
            storager.delete(name);
        })
    })
})