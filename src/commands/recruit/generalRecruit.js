const {
  createSquadRecruitCommand
} = require('../../factories/createSquadRecruitCommand');

module.exports =
  createSquadRecruitCommand({
    name: '일반구인',

    description:
      '일반게임 스쿼드 구인을 생성합니다.',

    type: 'GENERAL',

    title:
      '🎮 일반게임 구인',
  });