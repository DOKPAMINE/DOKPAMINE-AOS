import { loginSchema, signupSchema } from '../validation';

const valid = { username: 'reader_01', password: 'password', nickname: '독자' };

test.each(['', '   ', 'a'.repeat(256)])('FR-10 · S-02 비어 있거나 너무 긴 아이디 %s는 거절해요', username => {
    expect(loginSchema.safeParse({ ...valid, username }).success).toBe(false);
});

test.each(['abc', 'a'.repeat(31), 'reader@example.test', 'reader-01', '독자_01'])('FR-10 · S-03 가입 아이디 %s는 거절해요', username => {
    expect(signupSchema.safeParse({ ...valid, username }).success).toBe(false);
});

test.each(['A_01', 'a'.repeat(30)])('FR-10 · S-03 가입 아이디 경계 %s는 허용해요', username => {
    expect(signupSchema.safeParse({ ...valid, username }).success).toBe(true);
});

test.each([7, 65])('FR-10 · S-02/S-03 비밀번호 %i자는 거절해요', length => {
    expect(signupSchema.safeParse({ ...valid, password: 'a'.repeat(length) }).success).toBe(false);
});

test.each([8, 64])('FR-10 · S-02/S-03 비밀번호 경계 %i자는 허용해요', length => {
    expect(loginSchema.safeParse({ ...valid, password: 'a'.repeat(length) }).success).toBe(true);
});

test.each(['', '   ', '가'.repeat(16)])('FR-10 · S-03 닉네임 경계 밖 %s는 거절해요', nickname => {
    expect(signupSchema.safeParse({ ...valid, nickname }).success).toBe(false);
});

test.each([1, 15])('FR-10 · S-03 닉네임 경계 %i자는 허용해요', length => {    expect(signupSchema.safeParse({ ...valid, nickname: '가'.repeat(length) }).success).toBe(true);
});

test('FR-10 · S-03 아이디와 닉네임은 공백을 정리하고 비밀번호 원문은 보존해요', () => {
    expect(signupSchema.parse({ username: ' reader_01 ', password: ' pass word ', nickname: ' 독자 ' })).toEqual({ username: 'reader_01', password: ' pass word ', nickname: '독자' });
});
