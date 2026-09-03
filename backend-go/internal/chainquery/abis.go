package chainquery

// RegistryEventsABI contains only the event entries from PublicationRegistry,
// used to decode eth_getLogs results.
const RegistryEventsABI = `[
  {"anonymous":false,"inputs":[{"indexed":true,"name":"msId","type":"uint256"},{"indexed":true,"name":"doiTokenId","type":"uint256"}],"name":"DOIMinted","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"name":"msId","type":"uint256"},{"indexed":false,"name":"doi","type":"string"},{"indexed":true,"name":"doiTokenId","type":"uint256"}],"name":"DOIRegistered","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"name":"msId","type":"uint256"},{"indexed":false,"name":"decision","type":"uint8"}],"name":"DecisionMade","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"name":"reviewer","type":"address"},{"indexed":false,"name":"amount","type":"uint256"}],"name":"IncentivePaid","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"name":"msId","type":"uint256"},{"indexed":false,"name":"newCid","type":"string"},{"indexed":false,"name":"version","type":"uint256"}],"name":"ManuscriptRevised","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"name":"msId","type":"uint256"},{"indexed":true,"name":"author","type":"address"},{"indexed":false,"name":"cid","type":"string"}],"name":"ManuscriptSubmitted","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"name":"msId","type":"uint256"},{"indexed":true,"name":"reviewer","type":"address"},{"indexed":false,"name":"verdict","type":"uint8"},{"indexed":false,"name":"reviewCid","type":"string"}],"name":"ReviewSubmitted","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"name":"msId","type":"uint256"},{"indexed":false,"name":"reviewers","type":"address[]"}],"name":"ReviewersAssigned","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"name":"msId","type":"uint256"},{"indexed":false,"name":"approved","type":"bool"},{"indexed":false,"name":"field","type":"string"},{"indexed":false,"name":"editorCid","type":"string"}],"name":"EditorReviewed","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"name":"reviewer","type":"address"},{"indexed":false,"name":"fields","type":"string[]"}],"name":"ReviewerFieldsVerified","type":"event"}
]`

// RegistryViewABI contains the read-only (view) functions used to query
// current contract state directly, replacing what the old indexer's Postgres
// mirror used to serve from a cache.
const RegistryViewABI = `[
  {"inputs":[{"name":"msId","type":"uint256"}],"name":"getManuscript","outputs":[{"components":[{"name":"id","type":"uint256"},{"name":"author","type":"address"},{"name":"cid","type":"string"},{"name":"metadata","type":"string"},{"name":"status","type":"uint8"},{"name":"version","type":"uint256"},{"name":"plagiarismScore","type":"uint256"},{"name":"reviewers","type":"address[]"},{"name":"acceptCount","type":"uint256"},{"name":"rejectCount","type":"uint256"},{"name":"reviseCount","type":"uint256"},{"name":"reviewCount","type":"uint256"},{"name":"doi","type":"string"},{"name":"field","type":"string"}],"name":"","type":"tuple"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"nextManuscriptId","outputs":[{"name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"name":"","type":"uint256"},{"name":"","type":"address"}],"name":"hasReviewed","outputs":[{"name":"","type":"bool"}],"stateMutability":"view","type":"function"}
]`

// OracleEventsABI contains only the event entries from ReviewOracle.
const OracleEventsABI = `[
  {"anonymous":false,"inputs":[{"indexed":true,"name":"requestId","type":"uint256"},{"indexed":true,"name":"msId","type":"uint256"},{"indexed":false,"name":"score","type":"uint256"}],"name":"PlagiarismCheckFulfilled","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"name":"requestId","type":"uint256"},{"indexed":true,"name":"msId","type":"uint256"},{"indexed":false,"name":"cid","type":"string"}],"name":"PlagiarismCheckRequested","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"name":"requestId","type":"uint256"},{"indexed":true,"name":"msId","type":"uint256"},{"indexed":false,"name":"reviewers","type":"address[]"}],"name":"ReviewerSelectionFulfilled","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"name":"requestId","type":"uint256"},{"indexed":true,"name":"msId","type":"uint256"}],"name":"ReviewerSelectionRequested","type":"event"}
]`

// DOITokenEventsABI contains only the event entries from DOIToken.
const DOITokenEventsABI = `[
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
	7: "PENDING_EDITOR",
}

var VerdictNames = map[uint8]string{
	0: "ACCEPT",
	1: "REJECT",
	2: "REVISE",
}
