import type {VideoWallConfig} from '../shared/types';

/** Video UV sampled through the measured panel homography, from one audience reference position. */
export function createOpticalProjector(wall:VideoWallConfig,id:string){
  const calibration=wall.optical,display=calibration?.displays.find(d=>d.displayId===id);
  if(!calibration||!display)return null;
  const canvas=document.createElement('canvas');
  const gl=canvas.getContext('webgl',{alpha:false,antialias:false,preserveDrawingBuffer:true});
  if(!gl)throw new Error('WebGL indisponibil pentru calibrarea optică.');
  const shader=(type:number,source:string)=>{const s=gl.createShader(type)!;gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s)??'Shader invalid');return s;};
  const vertex=shader(gl.VERTEX_SHADER,'attribute vec2 p; varying vec2 uv; void main(){uv=vec2((p.x+1.0)*.5,(1.0-p.y)*.5);gl_Position=vec4(p,0.,1.);}');
  const fragment=shader(gl.FRAGMENT_SHADER,`precision highp float;varying vec2 uv;uniform sampler2D film;uniform mat3 mapping;uniform vec4 placement;
    void main(){vec3 q=mapping*vec3(uv,1.);vec2 xy=q.xy/q.z;vec2 st=(xy-placement.xy)/placement.zw;
      if(st.x<0.||st.x>1.||st.y<0.||st.y>1.)gl_FragColor=vec4(0.,0.,0.,1.);else gl_FragColor=texture2D(film,st);}`);
  const program=gl.createProgram()!;gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('Program optic invalid.');gl.useProgram(program);
  const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
  const a=gl.getAttribLocation(program,'p');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);
  const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  const h=display.uvToCamera;gl.uniformMatrix3fv(gl.getUniformLocation(program,'mapping'),false,new Float32Array([h[0],h[3],h[6],h[1],h[4],h[7],h[2],h[5],h[8]]));
  const points=calibration.displays.flatMap(d=>d.normalizedCorners),left=Math.min(...points.map(p=>p[0])),top=Math.min(...points.map(p=>p[1])),width=Math.max(...points.map(p=>p[0]))-left,height=Math.max(...points.map(p=>p[1]))-top;
  return {canvas,draw(video:HTMLVideoElement,W:number,H:number){
    if(gl.isContextLost())throw new Error('Context optic pierdut.');
    if(canvas.width!==W||canvas.height!==H){canvas.width=W;canvas.height=H;}gl.viewport(0,0,W,H);
    const scale=(wall.fit==='cover'?Math.max:Math.min)(width*calibration.imageSize.width/video.videoWidth,height*calibration.imageSize.height/video.videoHeight);
    const vw=video.videoWidth*scale/calibration.imageSize.width,vh=video.videoHeight*scale/calibration.imageSize.height;
    gl.uniform4f(gl.getUniformLocation(program,'placement'),left+(width-vw)*wall.focusX,top+(height-vh)*wall.focusY,vw,vh);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,video);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
  },dispose(){gl.deleteTexture(texture);gl.deleteBuffer(buffer);gl.deleteProgram(program);gl.deleteShader(vertex);gl.deleteShader(fragment);gl.getExtension('WEBGL_lose_context')?.loseContext();}};
}
