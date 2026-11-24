import {
    ActivityIndicator,
    Image,
    KeyboardAvoidingView,
    Modal,
    Pressable,
    RefreshControl,
    ScrollView,
    Switch,
    Text,
    TextInput,
    View,
} from 'react-native';

/**
 * 앱 화면이 쓰는 react-native 컴포넌트를 미리 불러온다(#103).
 *
 * react-native는 컴포넌트를 지연 getter로 내보내서, 속성에 접근하는 것만으로 해당 모듈을 불러온다.
 * 이 로딩을 첫 render가 떠안으면 전체 실행처럼 워커가 몰리거나 Jest 캐시가 없을 때(CI) 5초 제한을 넘는다.
 * 그래서 테스트 파일 맨 위(시간 제한이 없는 파일 로딩 단계)에서 호출한다. beforeAll 안에서 부르면 다시 시간 제한을 받는다.
 * 아래 접근은 쓸모없어 보여도 로딩을 일으키는 부분이므로 지우면 안 된다.
 * 목록은 app/·src/ 앱 코드가 react-native에서 가져오는 컴포넌트 전체다. 화면에 새 컴포넌트를 쓰면 여기에 추가한다.
 */
export function preloadReactNative() {
    void [ActivityIndicator, Image, KeyboardAvoidingView, Modal, Pressable, RefreshControl, ScrollView, Switch, Text, TextInput, View];
}
