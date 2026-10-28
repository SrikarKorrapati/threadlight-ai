const $ = id => document.getElementById(id);
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
async function send(type,data={}){const result=await chrome.runtime.sendMessage({type,...data});if(!result?.ok)throw new Error(result?.error||'The extension did not respond.');return result;}
async function load(){const r=await send('GET_SETTINGS');$('token').value=r.settings.pairingToken||'';$('account').value=r.settings.accountLabel||'Personal';$('url').value=r.settings.bridgeUrl||'http://127.0.0.1:4318';}
$('settings').addEventListener('submit',async e=>{e.preventDefault();try{await send('SAVE_SETTINGS',{settings:{pairingToken:$('token').value.trim(),accountLabel:$('account').value.trim(),bridgeUrl:$('url').value}});status('Connection saved.');}catch(error){status(error.message,true);}});
$('test').addEventListener('click',async()=>{try{status('Testing…');const r=await send('HEALTH');const health=r.health||r;if(health.ready===false)throw new Error('The local service is running. Add your OpenAI key in local setup.');status('Local service connected.');}catch(error){status(error.message,true);}});
load().catch(error=>status(error.message,true));
