declare module '@zsea/snowflake'{
    export class snowflake{
        constructor(options:{
            timestampBits:number,
            twepoch:number,
            workerIdBits:number,
            workerId:number,
            dataCenterIdBits:number,
            dataCenterId:number,
            sequenceBits:number,
            type:"auto"|"string"|"bigint"|"number"
        }|undefined)
        nextId():string|bigint|number
    }
}