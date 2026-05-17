'use strict';

/**
 * @typedef {Object} UsageResult
 * @property {string}  provider       - Provider ID
 * @property {boolean} connected      - Whether creds are valid and API is reachable
 * @property {string|null} error      - Error message if !connected
 * @property {Object} session
 * @property {number} session.used    - Tokens used this rate-limit window
 * @property {number} session.limit   - Token limit for this window
 * @property {number} session.resetAt - Unix ms when window resets
 * @property {number} session.pct     - Percentage used (0-100)
 * @property {Object} period          - Daily / weekly stats
 * @property {number} period.used
 * @property {number} period.limit
 * @property {number} period.resetAt
 * @property {number} period.pct
 * @property {Object} cost
 * @property {number} cost.session    - USD this session
 * @property {number} cost.period     - USD this period
 * @property {string[]} models        - All supported model IDs
 * @property {string} activeModel     - Last-used model
 * @property {number} lastFetched     - Unix ms of last successful fetch
 */

/**
 * @typedef {Object} TaskResult
 * @property {string} id
 * @property {string} provider
 * @property {string} model
 * @property {number} tokensIn
 * @property {number} tokensOut
 * @property {number} tokensLimit
 * @property {number} startedAt      - Unix ms
 * @property {string} status         - 'active' | 'idle' | 'done'
 * @property {string} label          - Short description from first message
 */

/**
 * @typedef {Object} Provider
 * @property {string}   id
 * @property {string}   name
 * @property {string}   color          - Hex brand color
 * @property {string}   mascot         - Mascot character ID
 * @property {string[]} models
 * @property {() => Promise<UsageResult>} fetchUsage
 * @property {() => Object} getCredentialFields
 * @property {(creds: Object) => Promise<boolean>} validateCredentials
 * @property {(creds: Object) => void} setCredentials
 */

module.exports = {};
