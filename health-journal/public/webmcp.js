// Optional navigation integration. No health records or mutations are exposed.
const context=document.modelContext;
if(context?.registerTool){
  const lifecycle=new AbortController();
  const views=['home','journal','profile','settings'];
  try {
    Promise.resolve(context.registerTool({
      name:'navigate_health_journal',
      title:'Open a Health Journal screen',
      description:'Navigate to Today, My journal, Health profile, or Preferences. This only changes the visible screen. It does not save, generate, export, delete, or send any record.',
      inputSchema:{type:'object',properties:{view:{type:'string',enum:views}},required:['view'],additionalProperties:false},
      annotations:{readOnlyHint:false,untrustedContentHint:false},
      execute(input){
        if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==1||!views.includes(input.view))throw new Error('Choose a supported journal screen.');
        const button=document.querySelector(`.nav [data-page="${input.view}"]`);
        if(!button)throw new Error('The journal is still opening. Try again.');
        button.click();
        return {view:input.view,navigated:true,recordsChanged:false};
      },
    },{signal:lifecycle.signal})).catch(()=>{});
  }catch{}
  window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
