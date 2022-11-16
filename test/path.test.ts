import path from "../fs/path"

describe("路径处理",()=>{
    test("获取带后缀的名称",()=>{
        expect(path.basename("/a/b/c.txt")).toEqual("c.txt");
    })
    test("获取不带后缀的名称",()=>{
        expect(path.basename("/a/b/c.txt",".txt")).toEqual("c");
    })
    test("路径合并",()=>{
        expect(path.join(["/a/b","c"])).toEqual("/a/b/c");
    })
})