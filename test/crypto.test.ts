import { XorCrypto,Base64Crypto } from "../fs/icrypto";

describe("异或加解密",()=>{
    let xorCrypto=new XorCrypto(1)
    //let encrypto:Buffer|undefined;
    test("加密测试",()=>{
        let buffer=Buffer.from([1,1,1,1]);
        return xorCrypto.encrypt(buffer).then((content)=>{
            //encrypto=content;
            expect(content).toEqual(Buffer.from([0,0,0,0]))
        })
    })
    test("解密测试",()=>{
        let buffer=Buffer.from([0,0,0,0]);
        return xorCrypto.decrypt(buffer).then((content)=>{
            //encrypto=content;
            //console.log(encrypto);
            expect(content).toEqual(Buffer.from([1,1,1,1]))
        })
    })
})
describe("Base64加密",()=>{
    let base64Crypto=new Base64Crypto()
    //let encrypto:Buffer|undefined;
    test("加密测试",()=>{
        let buffer=Buffer.from("this is a example","utf8");
        return base64Crypto.encrypt(buffer).then((content)=>{
            //encrypto=content;
            expect(content.toString("utf8")).toEqual("dGhpcyBpcyBhIGV4YW1wbGU=")
        })
    })
    test("解密测试",()=>{
        let buffer=Buffer.from("dGhpcyBpcyBhIGV4YW1wbGU=","utf8");
        return base64Crypto.decrypt(buffer).then((content)=>{
            //encrypto=content;
            //console.log(encrypto);
            expect(content.toString("utf8")).toEqual("this is a example")
        })
    })
})