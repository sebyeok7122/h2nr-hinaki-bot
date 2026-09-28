const {
  createSquadRecruitCommand
} = require('../../factories/createSquadRecruitCommand');

module.exports =
  createSquadRecruitCommand({
    name: '경쟁빡겜',

    description:
      '경쟁 빡겜 스쿼드 구인을 생성합니다.',

    type: 'RANKED_HARD',

    title:
      '🔥 경쟁 빡겜 구인 🔥',
  });