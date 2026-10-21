// Aplica o plugin do @nestjs/swagger no ts-jest, com as mesmas opções do nest-cli.json:
// a spec gerada nos testes fica igual à do build.
const plugin = require('@nestjs/swagger/plugin');
const { compilerOptions } = require('../../nest-cli.json');

const { options } = compilerOptions.plugins.find((p) => p.name === '@nestjs/swagger');

module.exports.name = 'nestjs-swagger-transformer';
module.exports.version = 1;
module.exports.factory = (tsCompiler) => plugin.before(options, tsCompiler.program);
