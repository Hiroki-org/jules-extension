const { getOctokitInstance } = require('./out/githubUtils.js');
getOctokitInstance('dummy').then(o => console.log(typeof o)).catch(console.error);
