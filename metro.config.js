const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Babel inline-import가 .sql을 문자열로 바꾸도록 Metro가 .sql을 해석하게 합니다.
config.resolver.sourceExts.push('sql');

module.exports = config;
