const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Drizzle 마이그레이션 SQL을 Babel에서 문자열로 인라인합니다.
config.resolver.sourceExts.push('sql');

module.exports = config;
