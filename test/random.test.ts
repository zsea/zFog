import { Random } from "../fs/random";

describe("随机数测试",()=>{
    test("产生[0,1)随机数",()=>{
        expect(Random.random()).toBeGreaterThanOrEqual(0);
        expect(Random.random()).toBeLessThan(1);
    })
    test("产生[1,10)随机数整数",()=>{
        expect(Random.rangeInt(1,10)).toBeGreaterThanOrEqual(1);
        expect(Random.rangeInt(1,10)).toBeLessThan(10);
    })
    test("产生[1,10]随机数整数",()=>{
        expect(Random.rangeInt(1,10,"closed")).toBeGreaterThanOrEqual(1);
        expect(Random.rangeInt(1,10,"closed")).toBeLessThanOrEqual(10);
    })
})