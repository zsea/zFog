

export interface StorageConfigure {
    mountPoint: string,
    blockSize?: number,
    type: "gitee" | "github",
    [p: string]: string | number | boolean | undefined | null
}
export interface UserConfigure {
    username: string,
    password: string,
    path?: string
    rights?: string[]
}
export interface Configure {
    fs: StorageConfigure[],
    users: UserConfigure[],
    authenticateType?:"basic"|"digest"
}
export async function LoadConfigure(name: string = "WEBDAV_CONFIGURE", type: string = "WEBDAV_CONFIGURE_TYPE"): Promise<Configure> {
    let v = process.env[name];
    if (!v) return { fs: [], users: [] };
    let text: string = "", typeValue: string = process.env[type] || "base64";
    if (typeValue === "base64") {
        text = Buffer.from(v, "base64").toString("utf-8");
    }
    let cfg = JSON.parse(text);

    return cfg;
}