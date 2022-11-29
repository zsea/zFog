import { GiteeStorage } from "../fs/devices/gitee"
import { GithubStorage } from "../fs/devices/github"
import { OSSStorage } from "../fs/devices/oss"
import { QuarkStorage } from "../fs/devices/quark"
import { ArraySaver, INodeSaver, LocalSaver, MemorySaver } from "../fs/isaver"
import { IStorage } from "../fs/storage"

export interface saver {
    type: "gitee" | "github" | "local" | "array" | "memory" | "oss" | "quark"
    [key: string]: string | boolean | number | saver[]

}

export function createSaver(s: saver, storages?: IStorage[]): INodeSaver | undefined {
    if (s.from && storages) {
        let finder = storages.find(p => (p as any).ref === s.from && s.type === p.type);
        if (finder) return (finder as any) as INodeSaver;
        throw new Error(`Saver ${s.from} Not Found`)
    }
    switch (s.type) {
        case "local": {
            return new LocalSaver(s.path as string);
        }
        case "github": {
            return new GithubStorage(s.token as string, s.owner as string, s.repo as string, s.branch as string, s.root as string);
        }
        case "gitee": {
            return new GiteeStorage(s.token as string, s.owner as string, s.repo as string, s.branch as string, s.root as string);
        }
        case "oss": {
            return new OSSStorage(s.accessKey as string, s.secret as string, s.host as string, s.blucket as string, s.root as string);
        }
        case "quark": {
            return new QuarkStorage(s.cookies as string, s.root as string);
        }
        case "memory": {
            return new MemorySaver();
        }
        case "array": {
            let saver = new ArraySaver();
            if (s.children) {
                let children: saver[] = s.children as saver[];
                for (let i = 0; i < children.length; i++) {
                    let child = createSaver(children[i], storages);
                    if (child) {
                        saver.Add(child);
                    }
                }
            }
            return saver;
        }
    }
}