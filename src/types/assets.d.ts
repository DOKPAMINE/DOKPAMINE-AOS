// 이미지 파일을 import 하면 React Native가 쓰는 이미지 번호(require 결과)가 나온다.
declare module '*.jpg' {
    const source: number;
    export default source;
}
declare module '*.png' {
    const source: number;
    export default source;
}
