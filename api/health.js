'use strict';
const {health,json}=require('../server/index');
module.exports=async function handler(req,res){const result=await health();return json(res,result.ok?200:503,result);};
