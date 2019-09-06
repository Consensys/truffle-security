const report =   {
  "issues": [
    {
      "swcID": "SWC-103",
      "swcTitle": "Floating Pragma",
      "description": {
        "head": "A floating pragma is set.",
        "tail": "It is recommended to make a conscious choice on what version of Solidity is used for compilation. Currently any version equal or grater than \"0.4.15\" is allowed."
      },
      "severity": "",
      "locations": [
        {
          "sourceMap": "0:24:1"
        }
      ],
      "extra": {}
    },
    {
      "swcID": "SWC-100",
      "swcTitle": "Function Default Visibility",
      "description": {
        "head": "The function visibility is not set.",
        "tail": "The function \"bid\" does not have an explicit visibility set. The default visibility is set to public and anyone call the function."
      },
      "severity": "",
      "locations": [
        {
          "sourceMap": "199:410:1"
        }
      ],
      "extra": {}
    },
    {
      "swcID": "SWC-108",
      "swcTitle": "State Variable Default Visibility",
      "description": {
        "head": "The state variable visibility is not set.",
        "tail": "It is best practice to set the visibility of state variables explicitly. The default visibility for \"currentFrontrunner\" is internal. Other possible visibility values are public and private."
      },
      "severity": "",
      "locations": [
        {
          "sourceMap": "94:18:0"
        },
        {
          "sourceMap": "687:18:1"
        }
      ],
      "extra": {}
    },
    {
      "swcID": "SWC-108",
      "swcTitle": "State Variable Default Visibility",
      "description": {
        "head": "The state variable visibility is not set.",
        "tail": "It is best practice to set the visibility of state variables explicitly. The default visibility for \"currentBid\" is internal. Other possible visibility values are public and private."
      },
      "severity": "",
      "locations": [
        {
          "sourceMap": "121:10:0"
        },
        {
          "sourceMap": "717:10:0"
        }
      ],
      "extra": {}
    },
    {
      "swcID": "SWC-108",
      "swcTitle": "State Variable Default Visibility",
      "description": {
        "head": "The state variable visibility is not set.",
        "tail": "It is best practice to set the visibility of state variables explicitly. The default visibility for \"refunds\" is internal. Other possible visibility values are public and private."
      },
      "severity": "",
      "locations": [
        {
          "sourceMap": "798:7:0"
        }
      ],
      "extra": {}
    },
    {
      "swcID": "SWC-104",
      "swcTitle": "Unchecked Call Return Value",
      "description": {
        "head": "Unchecked return value from low level call.",
        "tail": "Return value for \"msg.send\" is not checked. Always check the return value for low level calls like call(), send() and delegatecall() as they can fail."
      },
      "severity": "",
      "locations": [
        {
          "sourceMap": "1360:23:0"
        }
      ],
      "extra": {}
    },
    {
      "swcID": "SWC-119",
      "swcTitle": "Shadowing State Variables",
      "description": {
        "head": "State variable shadows another state variable.",
        "tail": "The state variable \"currentFrontrunner\" in contract \"DosAuction\" shadows another state variable with the same name \"currentFrontrunner\" in contract \"SecureAuction\"."
      },
      "severity": "",
      "locations": [
        {
          "sourceMap": "86:26:0"
        }
      ],
      "extra": {}
    },
    {
      "swcID": "SWC-119",
      "swcTitle": "Shadowing State Variables",
      "description": {
        "head": "State variable shadows another state variable.",
        "tail": "The state variable \"currentBid\" in contract \"DosAuction\" shadows another state variable with the same name \"currentBid\" in contract \"SecureAuction\"."
      },
      "severity": "",
      "locations": [
        {
          "sourceMap": "116:15:0"
        }
      ],
      "extra": {}
    }
  ],
  "sourceType": "solidity-file",
  "sourceFormat": "text",
  "sourceList": [
    "/tmp/954638752/03-auction.sol",
    "/tmp/954638752/03-auction.sol"
  ],
  "meta": {
    "error": [],
    "selected_compiler": "0.4.15",
    "warning": [
      "Solc:/tmp/954638752/03-auction.sol:51:5: Warning: Failure condition of 'send' ignored. Consider using 'transfer' instead.\n    msg.sender.send(refund);\n    ^---------------------^\n"
    ]
  }
};

const issues2eslint = require('../../lib/issues2eslint');
const mythlib = require('../../lib/mythx');
const fs = require('fs');

function getFormatter(style) {
  const formatterName = style || 'stylish';
  try {
      return require(`eslint/lib/formatters/${formatterName}`);
  } catch (ex) {
      ex.message = `\nThere was a problem loading formatter option: ${style} \nError: ${
          ex.message
      }`;
      throw ex;
  }
}

const buildObj = JSON.parse(fs.readFileSync('./SecureAuction.json', 'utf-8'));
const mythOb = mythlib.truffle2MythXJSON(buildObj);
const remappedIssues = mythlib.remapMythXOutput(report);

const info = new issues2eslint.Info(mythOb);
const esss = remappedIssues.map(issue => info.convertMythXReport2EsIssues(issue, true))

const fmt = getFormatter('stylish');
const resESmess = fmt(esss);
console.log(resESmess);