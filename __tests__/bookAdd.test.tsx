import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { useCameraPermissions } from 'expo-camera';
import { BookAddScreen } from '../src/books/add/BookAddScreen';
import { initializeDatabase } from '../src/db/client';
import { catalogIsbn } from '../src/api/endpoints';
import { isOnline } from '../src/api/connectivity';
import { ApiError } from '../src/api/errors';

jest.mock('expo', () => ({ uuid: { v4: () => '00000000-0000-4000-8000-000000000001' } }));
jest.mock('expo-router', () => ({
    router: { replace: jest.fn(), back: jest.fn(), canGoBack: () => false },
    useIsFocused: () => true,
}));
jest.mock('expo-camera', () => {
    const React = require('react');
    const { View } = require('react-native');
    return { useCameraPermissions: jest.fn(), CameraView: (props: object) => React.createElement(View, { ...props, testID: 'isbn-camera' }) };
});
jest.mock('../src/db/client', () => ({ initializeDatabase: jest.fn() }));
jest.mock('../src/api/endpoints', () => ({ catalogIsbn: jest.fn() }));
jest.mock('../src/api/connectivity', () => ({ isOnline: jest.fn() }));

const isbn = '9780306406157';
const requestPermission = jest.fn();
const save = jest.fn();
const list = jest.fn();
function permission(status: 'granted' | 'denied' | 'undetermined') {
    jest.mocked(useCameraPermissions).mockReturnValue([{ status, granted: status === 'granted', canAskAgain: status !== 'denied', expires: 'never' }, requestPermission, jest.fn()] as ReturnType<typeof useCameraPermissions>);
}
beforeEach(() => {
    jest.clearAllMocks();
    permission('denied');
    requestPermission.mockResolvedValue({ granted: false, status: 'denied' });
    list.mockReturnValue([]);
    save.mockImplementation(value => ({ ...value, syncPending: true }));
    jest.mocked(initializeDatabase).mockResolvedValue({ repository: { books: { list, save } } } as unknown as Awaited<ReturnType<typeof initializeDatabase>>);
    jest.mocked(isOnline).mockResolvedValue(true);
    jest.mocked(catalogIsbn).mockResolvedValue({ isbn, title: '데미안', author: '헤르만 헤세', totalPages: 240, genre: '소설', source: 'nlk' });
});

async function scan() {
    permission('granted');
    await render(<BookAddScreen />);
    await fireEvent(screen.getByTestId('isbn-camera'), 'barcodeScanned', { data: isbn });
}
async function fillManual() {
    await fireEvent.changeText(screen.getByLabelText('제목 (필수)'), '데미안');
    await fireEvent.changeText(screen.getByLabelText('저자 (필수)'), '헤르만 헤세');
    await fireEvent.changeText(screen.getByLabelText('전체 쪽수 (필수)'), '240');
    await fireEvent.press(screen.getByRole('radio', { name: '소설' }));
}

test('NFR-07 · S-21/S-23 카메라 권한 거절 뒤에도 직접 입력으로 책을 등록해요', async () => {
    await render(<BookAddScreen />);
    expect(screen.getByRole('header', { name: '카메라를 쓸 수 없어요' })).toBeOnTheScreen();
    expect(requestPermission).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: '직접 입력하기' }));
    await fillManual();
    expect(screen.getByRole('radio', { name: '소설', checked: true })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '읽고 싶은 책에 담기' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ title: '데미안', genre: '소설', status: 'WANT', isbn: null })));
    expect(router.replace).toHaveBeenCalledWith('/book/00000000-0000-4000-8000-000000000001');
    expect(catalogIsbn).not.toHaveBeenCalled();
});
test('NFR-07 · S-20 처음 진입에만 카메라 권한을 요청하고 직접 입력에서는 재요청하지 않아요', async () => {
    permission('undetermined');
    await render(<BookAddScreen />);
    await waitFor(() => expect(requestPermission).toHaveBeenCalledTimes(1));
    await fireEvent.press(screen.getByRole('button', { name: '직접 입력하기' }));
    expect(requestPermission).toHaveBeenCalledTimes(1);
});
test('FR-01 · S-20 5초 미인식이면 다시 찍기와 직접 입력을 제공해요', async () => {
    jest.useFakeTimers();
    try {
        permission('granted');
        await render(<BookAddScreen />);
        await fireEvent(screen.getByTestId('isbn-camera'), 'cameraReady');
        await act(() => jest.advanceTimersByTime(5000));
        expect(screen.getByRole('button', { name: '다시 찍기' })).toBeOnTheScreen();
        await fireEvent.press(screen.getByRole('button', { name: '다시 찍기' }));
        expect(screen.queryByText('바코드를 찾지 못했어요. 빛 반사를 피해서 다시 찍거나 직접 입력해 주세요.')).toBeNull();
        expect(screen.getByRole('button', { name: '직접 입력하기' })).toBeOnTheScreen();
    } finally { jest.useRealTimers(); }
});
test('FR-01 · S-22 바코드 연속 인식은 한 번만 조회하고 확인 정보로 저장해요', async () => {
    await scan();
    expect(await screen.findByRole('header', { name: '책 정보 확인' })).toBeOnTheScreen();
    expect(catalogIsbn).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: '읽기 시작' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ isbn, status: 'READING' })));
    expect(router.replace).toHaveBeenCalledWith('/reading-start?bookId=00000000-0000-4000-8000-000000000001');
});
test('FR-01 · S-22 빠진 정보를 수정하고 조회된 ISBN은 유지해요', async () => {
    jest.mocked(catalogIsbn).mockResolvedValue({ isbn, title: '데미안', source: 'nlk' });
    await scan();
    await screen.findByRole('header', { name: '책 정보 확인' });
    expect(screen.getByRole('button', { name: '읽기 시작', disabled: true })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '정보 수정' }));
    expect(screen.getByLabelText('제목 (필수)')).toHaveDisplayValue('데미안');
    expect(screen.getByLabelText('ISBN (선택)')).toHaveDisplayValue(isbn);
    await fillManual();
    await fireEvent.press(screen.getByRole('button', { name: '읽고 싶은 책에 담기' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ isbn, status: 'WANT' })));
});
test('FR-01 · S-23 직접 입력 중 같은 ISBN이 있으면 저장 직전에 중복을 안내해요', async () => {
    await render(<BookAddScreen />);
    await fireEvent.press(screen.getByRole('button', { name: '직접 입력하기' }));
    await fillManual();
    await fireEvent.changeText(screen.getByLabelText('ISBN (선택)'), isbn);
    list.mockReturnValue([{ id: 'existing-book', isbn, title: '데미안', deleted: false }]);
    await fireEvent.press(screen.getByRole('button', { name: '읽고 싶은 책에 담기' }));
    await screen.findByRole('header', { name: '이미 책장에 있어요' });
    expect(save).not.toHaveBeenCalled();
});
test('FR-01 · S-22 늦은 조회 결과가 직접 입력 화면을 덮지 않아요', async () => {
    let finish: (value: Awaited<ReturnType<typeof catalogIsbn>>) => void = () => {};
    jest.mocked(catalogIsbn).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    await scan();
    await waitFor(() => expect(catalogIsbn).toHaveBeenCalled());
    await fireEvent.press(screen.getByRole('button', { name: '직접 입력하기' }));
    await act(() => finish({ isbn, title: '늦은 결과', source: 'nlk' }));
    expect(screen.getByRole('header', { name: '책 직접 입력' })).toBeOnTheScreen();
    expect(screen.getByLabelText('제목 (필수)')).toHaveDisplayValue('');
});
test('NFR-06 · S-22 오프라인은 요청 없이 안내하고 ISBN을 직접 입력에 유지해요', async () => {
    jest.mocked(isOnline).mockResolvedValue(false);
    await scan();
    expect(await screen.findByRole('header', { name: '인터넷 연결이 필요해요' })).toBeOnTheScreen();
    expect(catalogIsbn).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: '직접 입력하기' }));
    expect(screen.getByLabelText('ISBN (선택)')).toHaveDisplayValue(isbn);
});
test('FR-01 · S-24 조회 결과가 없으면 ISBN을 유지하고 직접 입력으로 이어져요', async () => {
    jest.mocked(catalogIsbn).mockRejectedValue(new ApiError('http', 'BOOK_NOT_FOUND', '책을 찾지 못했어요.', 404));
    await scan();
    await screen.findByRole('header', { name: '책을 찾지 못했어요' });
    await fireEvent.press(screen.getByRole('button', { name: '직접 입력하기' }));
    expect(screen.getByLabelText('ISBN (선택)')).toHaveDisplayValue(isbn);
});
test('FR-01 · S-25 기존 책은 API 조회와 중복 저장 없이 상세로 이어져요', async () => {
    list.mockReturnValue([{ id: 'existing-book', isbn, title: '데미안', deleted: false }]);
    await scan();
    await screen.findByRole('header', { name: '이미 책장에 있어요' });
    expect(catalogIsbn).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: '기존 책 상세 보기' }));
    expect(router.replace).toHaveBeenCalledWith('/book/existing-book');
});
test('FR-01 · S-23 필수 정보가 없으면 저장하지 않고 오류를 읽어 줘요', async () => {
    await render(<BookAddScreen />);
    await fireEvent.press(screen.getByRole('button', { name: '직접 입력하기' }));
    await fireEvent.press(screen.getByRole('button', { name: '읽기 시작' }));
    expect(await screen.findByText('제목을 입력해 주세요.')).toBeOnTheScreen();
    expect(screen.getByText('목록에서 장르를 선택해 주세요.')).toBeOnTheScreen();
    expect(save).not.toHaveBeenCalled();
});
test('FR-01 · S-23 저장 실패 뒤 입력 내용과 재시도 경로를 유지해요', async () => {
    save.mockImplementationOnce(() => { throw new Error('disk full'); });
    await render(<BookAddScreen />);
    await fireEvent.press(screen.getByRole('button', { name: '직접 입력하기' }));
    await fillManual();
    await fireEvent.press(screen.getByRole('button', { name: '읽기 시작' }));
    expect(await screen.findByText('책을 저장하지 못했어요. 입력한 내용을 유지했으니 다시 시도해 주세요.')).toBeOnTheScreen();
    expect(screen.getByLabelText('제목 (필수)')).toHaveDisplayValue('데미안');
    await fireEvent.press(screen.getByRole('button', { name: '읽기 시작' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
});
