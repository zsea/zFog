import { NoneCrypto } from "../fs/icrypto";
import { BlockManager, INodeManager } from "../fs/inode"
import { LocalSaver } from "../fs/isaver";
import { StorageManager, NullStorage } from "../fs/storage";
describe("INode", () => {
    let storageManager: StorageManager = new StorageManager();
    let nullStorage: NullStorage;
    test('创建 NullStorage', () => {
        nullStorage = new NullStorage();
        return nullStorage.initialize().then(() => {
            expect(nullStorage).not.toBeUndefined();
            storageManager.Add( nullStorage);
        })

    })
    let inodeManager: INodeManager = new INodeManager(()=>{
        return new BlockManager(storageManager, 1, "random", new NoneCrypto())
    }, new LocalSaver("./disk/inodes.json"));
    test('创建 /', () => {
        let inode = inodeManager.createINode("/", "dir");
        expect(inode.type).toBe("dir");
    });
    test('创建 /file', () => {
        let inode = inodeManager.createINode("/file", "file");
        expect(inode.type).toBe("file");
        //inode.blockManager.WriteBlock(0,Buffer.alloc(100));
    });
    test('读取 /', () => {
        let inode = inodeManager.getINode("/");
        expect(inode).not.toBeUndefined();
    });
    test('读取 /file', () => {
        let inode = inodeManager.getINode("/file");
        expect(inode).not.toBeUndefined();
    });
    test('读取 /none', () => {
        let inode = inodeManager.getINode("/none");
        expect(inode).toBeUndefined();
    });
    test("写入数据 /file", () => {
        let inode = inodeManager.getINode("/file");
        expect(inode).not.toBeUndefined();
        if (inode) {
            return inode.inode.blockManager.WriteBlock(0, Buffer.alloc(100)).then(o => {
                expect(o).toBeGreaterThan(0);
            })
        }
        else{
            throw new Error("无数据")
        }
    })
    // test('删除 /file', () => {
    //     //let inode = inodeManager.getINode("/file");
    //     expect(inodeManager.removeINode("/file"));
    // });

})