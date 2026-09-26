const {
  createSquadRecruitCommand
} = require('../../factories/createSquadRecruitCommand');

module.exports =
  createSquadRecruitCommand({
    name: '경쟁구인',

    description:
      '경쟁전 스쿼드 구인을 생성합니다.',

    type: 'RANKED',

    title:
      '🏆 경쟁전 구인',
  });