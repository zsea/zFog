export interface ICrypto {
    decrypt(buffer: Buffer): Promise<Buffer>
    encrypt(buffer: Buffer): Promise<Buffer>
}

export class NoneCrypto implements ICrypto {
    decrypt(buffer: Buffer): Promise<Buffer> {
        return Promise.resolve(buffer);
    }
    encrypt(buffer: Buffer): Promise<Buffer> {
        return Promise.resolve(buffer);
    }

}

export class XorCrypto implements ICrypto {
    constructor(private mode: number) {

    }
    decrypt(buffer: Buffer): Promise<Buffer> {
        let content: Buffer = Buffer.alloc(buffer.length);
        for (let i = 0; i < buffer.length; i++) {
            content[i] = (buffer[i] ^ this.mode)
        }
        return Promise.resolve(content);
    }
    encrypt(buffer: Buffer): Promise<Buffer> {
        let content: Buffer = Buffer.alloc(buffer.length);
        for (let i = 0; i < buffer.length; i++) {
            content[i] = (buffer[i] ^ this.mode)
        }
        return Promise.resolve(content);
    }

}
export class Base64Crypto implements ICrypto {
    decrypt(buffer: Buffer): Promise<Buffer> {
        return Promise.resolve(Buffer.from(buffer.toString("utf8"),"base64"))
        //return Promise.resolve(Buffer.from(buffer.toString("base64"), "utf-8"));
    }
    encrypt(buffer: Buffer): Promise<Buffer> {
        return Promise.resolve(Buffer.from(buffer.toString("base64"), "utf-8"));
    }

}