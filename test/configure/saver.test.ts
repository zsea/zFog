import {saver,createSaver} from "../../configure/saver"
import {storage,createStorage} from "../../configure/storage"
import { IStorage } from "../../fs/storage"

describe("Saver测试",()=>{
    test("从from中获取",()=>{
        let storagers:IStorage[]=([
            {
                type:"null",
                mode:7
            },
            {
                type:"local",
                mode:7,
                path:"./disk",
                ref:"123"
            }
        ] as storage[]).map(p=>createStorage(p) as IStorage);
        let saver=createSaver({type:"local",from:"123"},storagers);
        expect(saver).toStrictEqual(storagers[1]);
    })
})