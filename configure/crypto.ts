import { Base64Crypto, ICrypto, NoneCrypto, XorCrypto } from "../fs/icrypto"

export interface crypto{
    type:"base64"|"none"|"xor"
    [key:string]:string|boolean|number
}

export function createCrypto(s:crypto):ICrypto{
    switch(s.type){
        case "base64":{
            return new Base64Crypto()
        }
        case "xor":{
            return new XorCrypto(s.mode as number);
        }
    }
    return new NoneCrypto();
}

