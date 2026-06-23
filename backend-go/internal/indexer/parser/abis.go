package parser

// RegistryABI contains only the event entries from PublicationRegistry.
const RegistryABI = `[
  {"anonymous":false,"inputs":[{"indexed":true,"name":"msId","type":"uint256"},{"indexed":true,"name":"doiTokenId","type":"uint256"}],"name":"DOIMinted","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"name":"msId","type":"uint256"},{"indexed":false,"name":"doi","type":"string"},{"indexed":true,"name":"doiTokenId","type":"uint256"}],"name":"DOIRegistered","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"name":"msId","type":"uint256"},{"indexed":false,"name":"decision","type":"uint8"}],"name":"DecisionMade","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"name":"reviewer","type":"address"},{"indexed":false,"name":"amount","type":"uint256"}],"name":"IncentivePaid","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"name":"msId","type":"uint256"},{"indexed":false,"name":"newCid","type":"string"},{"indexed":false,"name":"version","type":"uint256"}],"name":"ManuscriptRevised","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"name":"msId","type":"uint256"},{"indexed":true,"name":"author","type":"address"},{"indexed":false,"name":"cid","type":"string"}],"name":"ManuscriptSubmitted","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"name":"msId","type":"uint256"},{"indexed":true,"name":"reviewer","type":"address"},{"indexed":false,"name":"verdict","type":"uint8"},{"indexed":false,"name":"reviewCid","type":"string"}],"name":"ReviewSubmitted","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"name":"msId","type":"uint256"},{"indexed":false,"name":"reviewers","type":"address[]"}],"name":"ReviewersAssigned","type":"event"}
]`

// OracleABI contains only the event entries from ReviewOracle.
const OracleABI = `[
  {"anonymous":false,"inputs":[{"indexed":true,"name":"requestId","type":"uint256"},{"indexed":true,"name":"msId","type":"uint256"},{"indexed":false,"name":"score","type":"uint256"}],"name":"PlagiarismCheckFulfilled","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"name":"requestId","type":"uint256"},{"indexed":true,"name":"msId","type":"uint256"},{"indexed":false,"name":"cid","type":"string"}],"name":"PlagiarismCheckRequested","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"name":"requestId","type":"uint256"},{"indexed":true,"name":"msId","type":"uint256"},{"indexed":false,"name":"reviewers","type":"address[]"}],"name":"ReviewerSelectionFulfilled","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"name":"requestId","type":"uint256"},{"indexed":true,"name":"msId","type":"uint256"}],"name":"ReviewerSelectionRequested","type":"event"}
]`

// DOITokenABI contains only the event entries from DOIToken.
const DOITokenABI = `[
  {"anonymous":false,"inputs":[{"indexed":true,"name":"doiId","type":"uint256"},{"indexed":true,"name":"reader","type":"address"},{"indexed":false,"name":"hash","type":"bytes32"}],"name":"CommentPosted","type":"event"}
]`

var StatusNames = map[uint8]string{
	0: "SUBMITTED",
	1: "CHECKING",
	2: "UNDER_REVIEW",
	3: "REVISION_REQUESTED",
	4: "ACCEPTED",
	5: "REJECTED",
	6: "PUBLISHED",
}

var VerdictNames = map[uint8]string{
	0: "ACCEPT",
	1: "REJECT",
	2: "REVISE",
}
