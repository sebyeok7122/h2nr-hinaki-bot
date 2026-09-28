const {
  createSquadRecruitCommand
} = require('../../factories/createSquadRecruitCommand');

module.exports =
  createSquadRecruitCommand({
    name: '일반빡겜',

    description:
      '일반 빡겜 스쿼드 구인을 생성합니다.',

    type: 'GENERAL_HARD',

    title:
      '🔥 일반 빡겜 구인 🔥',
  });