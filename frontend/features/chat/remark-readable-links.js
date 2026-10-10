/** GFM's bare-URL tokenizer can absorb a following Chinese sentence. Only split
 * literal autolinks: explicitly authored Markdown/angle links keep their URLs. */
export function remarkReadableLinks() {
  return (tree, file) => {
    const source=String(file);
    function visit(parent) {
      if(!Array.isArray(parent.children))return;
      const children=[];
      for(const node of parent.children){
        const start=node.position?.start?.offset,end=node.position?.end?.offset;
        const literal=Number.isInteger(start)&&Number.isInteger(end)?source.slice(start,end):'';
        const text=node.children?.length===1&&node.children[0].type==='text'?node.children[0].value:'';
        const boundary=node.type==='link'&&/^https?:\/\//iu.test(literal)&&literal===text?literal.search(/[。，；！？、（）【】《》「」『』]/u):-1;
        if(boundary>0){
          const url=literal.slice(0,boundary);
          children.push({...node,url,children:[{type:'text',value:url}]},{type:'text',value:literal.slice(boundary)});
        }else{visit(node);children.push(node);}
      }
      parent.children=children;
    }
    visit(tree);
  };
}
