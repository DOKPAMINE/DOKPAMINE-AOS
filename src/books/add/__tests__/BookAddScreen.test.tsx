import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useCameraPermissions } from 'expo-camera';
import { useIsFocused } from '@react-navigation/native';
import { BookAddScreen } from '../BookAddScreen';
import { BookForm } from '../BookForm';
import { emptyBookValues } from '../validation';
import { initializeDatabase } from '../../../db/client';
import { catalogIsbn } from '../../../api/endpoints';
import { isOnline } from '../../../api/connectivity';

jest.mock('expo', () => ({ uuid: { v4: () => '00000000-0000-4000-8000-000000000001' } }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), back: jest.fn(), canGoBack: () => false } }));
jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useIsFocused: jest.fn() }));
jest.mock('expo-camera', () => {
    const React = jest.requireActual<typeof import('react')>('react');
    const { View } = jest.requireActual<typeof import('react-native')>('react-native');
    return { useCameraPermissions: jest.fn(), CameraView: (props: object) => React.createElement(View, { ...props, testID: 'isbn-camera' }) };
});
jest.mock('../../../db/client', () => ({ initializeDatabase: jest.fn() }));
jest.mock('../../../api/endpoints', () => ({ catalogIsbn: jest.fn() }));
jest.mock('../../../api/connectivity', () => ({ isOnline: jest.fn() }));

const isbn = '9780306406157';
const requestPermission = jest.fn();
const save = jest.fn();
beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useIsFocused).mockReturnValue(true);
    jest.mocked(useCameraPermissions).mockReturnValue([{ status: 'granted', granted: true, canAskAgain: true, expires: 'never' }, requestPermission, jest.fn()] as ReturnType<typeof useCameraPermissions>);
    jest.mocked(initializeDatabase).mockResolvedValue({ repository: { books: { list: () => [], save } } } as unknown as Awaited<ReturnType<typeof initializeDatabase>>);
    jest.mocked(isOnline).mockResolvedValue(true);
    jest.mocked(catalogIsbn).mockResolvedValue({ isbn, title: '데미안', author: '헤세', totalPages: 240, genre: '소설', source: 'nlk' });
});

test('FR-01 S-23 ISBN의 X를 입력할 수 있는 키보드와 장르 선택 그룹을 제공해요', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    await render(<BookForm initialValues={{ ...emptyBookValues, title: '책', author: '저자', totalPages: '100', genre: '소설' }} onSave={onSave} />);
    expect(screen.getByLabelText('ISBN (선택)').props.keyboardType).toBe('default');
    expect(screen.getByLabelText('장르 선택').props.accessibilityRole).toBe('radiogroup');
    expect(screen.getByRole('radio', { name: '소설', checked: true })).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('ISBN (선택)'), '080442957X');
    await fireEvent.press(screen.getByRole('button', { name: '읽기 시작' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ isbn: '080442957X' }), 'READING'));
});

test('FR-01 S-23 ISBN을 변경하면 이전 ISBN 표지를 저장하지 않아요', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    await render(<BookForm initialValues={{ ...emptyBookValues, title: '책', author: '저자', totalPages: '100', genre: '소설', isbn, coverUrl: 'https://example.com/old-cover.jpg' }} onSave={onSave} />);
    await fireEvent.changeText(screen.getByLabelText('ISBN (선택)'), '080442957X');
    await fireEvent.press(screen.getByRole('button', { name: '읽기 시작' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ coverUrl: '', isbn: '080442957X' }), 'READING'));
});

test('NFR-07 S-20 카메라 시작 오류는 권한 거절과 구분하고 직접 입력을 유지해요', async () => {
    await render(<BookAddScreen />);
    await fireEvent(screen.getByTestId('isbn-camera'), 'mountError', { message: 'in use' });
    expect(screen.getByText('카메라를 시작하지 못했어요. 다른 앱에서 카메라를 사용 중인지 확인하거나 직접 입력해 주세요.')).toBeOnTheScreen();
    expect(screen.queryByText('카메라 권한이 없어도 직접 입력으로 책을 등록할 수 있어요. 권한은 기기 설정에서 변경할 수 있어요.')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: '카메라 다시 시도' }));
    expect(screen.getByTestId('isbn-camera')).toBeOnTheScreen();
    expect(requestPermission).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: '직접 입력하기' }));
    expect(screen.getByRole('header', { name: '책 직접 입력' })).toBeOnTheScreen();
});

test('FR-01 S-20 재포커스한 카메라는 준비 완료 뒤부터 5초를 세어요', async () => {
    jest.useFakeTimers();
    try {
        const { rerender } = await render(<BookAddScreen />);
        await fireEvent(screen.getByTestId('isbn-camera'), 'cameraReady');
        await act(() => jest.advanceTimersByTime(4000));
        jest.mocked(useIsFocused).mockReturnValue(false);
        await rerender(<BookAddScreen />);
        jest.mocked(useIsFocused).mockReturnValue(true);
        await rerender(<BookAddScreen />);
        await act(() => jest.advanceTimersByTime(6000));
        expect(screen.queryByRole('button', { name: '다시 찍기' })).toBeNull();
        await fireEvent(screen.getByTestId('isbn-camera'), 'cameraReady');
        await act(() => jest.advanceTimersByTime(5000));
        expect(screen.getByRole('button', { name: '다시 찍기' })).toBeOnTheScreen();
    } finally { jest.useRealTimers(); }
});

test('FR-01 S-22 조회 중 같은 바코드의 연속 콜백은 한 번만 요청해요', async () => {
    let finish: (value: Awaited<ReturnType<typeof catalogIsbn>>) => void = () => {};
    jest.mocked(catalogIsbn).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    await render(<BookAddScreen />);
    const camera = screen.getByTestId('isbn-camera');
    const callback = camera.props.onBarcodeScanned;
    await act(() => { callback({ data: isbn }); callback({ data: isbn }); callback({ data: isbn }); });
    await waitFor(() => expect(catalogIsbn).toHaveBeenCalledTimes(1));
    await act(() => finish({ isbn, title: '데미안', source: 'nlk' }));
    expect(await screen.findByRole('header', { name: '책 정보 확인' })).toBeOnTheScreen();
    expect(catalogIsbn).toHaveBeenCalledTimes(1);
});
