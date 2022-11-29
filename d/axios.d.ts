import {AxiosRequestConfig} from "axios"
declare module 'axios' {
    export interface AxiosRequestConfig {
      /**
       * @description 协带的自定义内容
       */
      customize?: any;
    }
  }