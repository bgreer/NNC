var time = 0.0;
var ptime = 0.0;
var pspeed = 0.0;
var plength;
var dt;
var canv, ctx;
var x, v, a, action, thrust, integral;
var num_hist, hist_index;
var x_hist, act_hist, wind_hist;
var timeout;
var step;
var simrun = false;
var P, I, D, logp, logi, logd;
var log10 = Math.log(10.0);
var dragging = false;
var slider = -1;
var on_p, on_i, on_d;
var noiselevel, windlevel, delaylevel;
var wind, wind_smooth;

var mode; // 0=PID, 1=NN
var numstate = 3;
var numneurons = 20;


var theta0 = [];
var theta1 = [];

var state = Array(numstate);
var neuronval = Array(numneurons);

function getOffset( el ) {
    var _x = 0;
    var _y = 0;
    while( el && !isNaN( el.offsetLeft ) && !isNaN( el.offsetTop ) ) {
        _x += el.offsetLeft - el.scrollLeft;
        _y += el.offsetTop - el.scrollTop;
        el = el.offsetParent;
    }
    return { top: _y, left: _x };
}


function init()
{
  canv = document.getElementById('canv-app');
  ctx = canv.getContext('2d');
  clear();

  mode = 0;

  time = 0.0;
  dt = 0.03;

  num_hist = 100;
  hist_index = 0;
  x_hist = Array(num_hist);
  act_hist = Array(num_hist);
  wind_hist = Array(num_hist);

  x = (Math.random()-0.5)*0.08;
  v = (Math.random()-0.5)*0.04;
  a = 0.0;
  integral = 0.0;
  action = 0.0;
  thrust = 0.0;

  P = 2.0;
  on_p = true;
  I = 0.01;
  on_i = false;
  D = 2.0;
  on_d = true;
  logp = Math.log(P) / log10;
  logi = Math.log(I) / log10;
  logd = Math.log(D) / log10;

	// load thetas
  init_weights();

  windlevel = 0;
  wind = 0.0;
  wind_smooth = 0.0;
  noiselevel = 0;
  delaylevel = 0;

  time = 0.0;
  ptime = 0.0;
  step = 0;


  simrun = false;
  draw();
  console.log("done with init.");
  canv.addEventListener('click', handleclick);
  canv.addEventListener('mousedown', handlemousedown);
  canv.addEventListener('mousemove', handlemousemove);
  canv.addEventListener('mouseup', handlemouseup);
  console.log("event listeners attached.");
}

function handlemousedown(event)
{
  var x = event.pageX - getOffset(canv).left - document.body.scrollLeft;
  var y = event.pageY - getOffset(canv).top - document.body.scrollTop;
	dragging = true;
	slider = -1;
	if (x >= 100 && x <= 400 && y >= 206 && y <= 224)
		slider = 0;
	if (x >= 100 && x <= 400 && y >= 236 && y <= 254)
		slider = 1;
	if (x >= 100 && x <= 400 && y >= 266 && y <= 284)
		slider = 2;

	if (slider >= 0)
		moveSlider(x-100);
}
function handlemouseup(event)
{dragging = false;}

function handlemousemove(event)
{
	if (dragging && slider >= 0)
		moveSlider(event.pageX - getOffset(canv).left - document.body.scrollLeft - 100);
}

function moveSlider(x)
{
	var value, logval;

	logval = x/300.0; // [0,1]
	if (logval < 0.0) logval = 0.0;
	if (logval > 1.0) logval = 1.0;
	logval = (logval*5.0) - 3.0; // [-3,2]
	value = Math.pow(10.0, logval);
	if (slider == 0)
		{P = value;logp = logval;}
	if (slider == 1)
		{I = value;logi = logval;}
	if (slider == 2)
		{D = value;logd = logval;}

	if (simrun==false) {clear();draw();}
}

function handleclick(event)
{
  var x = event.pageX - getOffset(canv).left - document.body.scrollLeft;
  var y = event.pageY - getOffset(canv).top - document.body.scrollTop;

  console.log("click: "+x+", "+y);
  // begin button
  if (x >= 10 && x <= 70 && y >= 170 && y <= 198)
  {
    simrun = true;
    run();
  }
  // poke
  if (x >= 10 && x <= 70 && y >= 200 && y <= 228 && simrun==true)
  {
	  v = (Math.random()-0.5)*0.4;
	  if (v < 0.0) v -= 0.1;
	  if (v >= 0.0) v += 0.1;
  }
  // reset button
  if (x >= 10 && x <= 70 && y >= 230 && y <= 258 && simrun==true) reset();
  // stop button
  if (x >= 10 && x <= 70 && y >= 260 && y <= 288 && simrun==true) {simrun = false; draw();} 
  // on/off buttons
  if (Math.sqrt(Math.pow(x-420,2) + Math.pow(y-214,2)) <= 10) on_p = !on_p;
  if (Math.sqrt(Math.pow(x-420,2) + Math.pow(y-244,2)) <= 10) {integral = 0.0;on_i = !on_i};
  if (Math.sqrt(Math.pow(x-420,2) + Math.pow(y-274,2)) <= 10) on_d = !on_d;
  // sim options
  if (Math.sqrt(Math.pow(x-260,2) + Math.pow(y-180,2)) <= 10)
  {
	  windlevel += 1;
	  if (windlevel == 3) windlevel = 0;
  }
  if (Math.sqrt(Math.pow(x-330,2) + Math.pow(y-180,2)) <= 10)
  {
	  noiselevel += 1;
	  if (noiselevel == 3) noiselevel = 0;
  }
  if (Math.sqrt(Math.pow(x-400,2) + Math.pow(y-180,2)) <= 10)
  {
	  delaylevel += 1;
	  if (delaylevel == 3) delaylevel = 0;
  }
  // PID vs NN
  if (Math.sqrt(Math.pow(x-110,2) + Math.pow(y-180,2)) <= 10) mode = 0;
  if (Math.sqrt(Math.pow(x-170,2) + Math.pow(y-180,2)) <= 10) mode = 1;
  if (simrun==false) {clear(); draw();}
}

function reset()
{
  x = (Math.random()-0.5)*0.08;
  v = (Math.random()-0.5)*0.04;
  a = 0.0;
  action = 0.0;
  integral = 0.0;
  thrust = 0.0;
  wind = 0.0;
  wind_smooth = 0.0;
  x_hist = Array(num_hist);
  act_hist = Array(num_hist);
  wind_hist = Array(wind_hist);
}


function run()
{
  // call run again in a moment
	if (simrun==true) timeout = setTimeout('run()', 5);

  delaycoef = Math.pow(7.0, -delaylevel*0.5);

  // PID
  measx = x + (Math.random()-0.5)*0.05*noiselevel*1.3;
  measv = v + (Math.random()-0.5)*0.052*noiselevel*1.3;

  action = 0.0;
  if (mode == 0)
  {
    // PID
    if (on_p) action -= P * measx;
    if (on_i) action -= I * integral;
    if (on_d) action -= D * measv;
  } else {
    // NN
    action = 1.5*(nn(measx/Math.PI, measv/20.0, integral/10000.0) - 0.5);
//    action = 50.0*(nn(0.0, 0.0, 0.0) - 0.5);
  }
//  if (delaylevel > 0.0)
//	  thrust = thrust * (1-delaycoef);
//  else
//	  thrust = 0.0;

  thrust = delaycoef*action + (1-delaycoef)*thrust;

  // maths
	x += v * dt;
  if (x > Math.PI/2.0) {x = Math.PI/2.0-1e-3; v = 0.0;}
  if (x < -Math.PI/2.0) {x = -Math.PI/2.0+1e-3; v = 0.0;}
  integral += measx;
  a = -0.3 * Math.cos(x) + thrust;
  if (Math.abs(v) > 1e-3) a -= 0.1*v*v*v/Math.abs(v);
  a += wind_smooth*0.04*windlevel;
  v += a * dt;

  // wind
  wind += Math.random()-0.5;
  wind *= 0.99;
  wind_smooth = 0.99*wind_smooth + 0.01*wind;

  plength = 20 * Math.cos(ptime);
  pspeed = thrust*30.0;

  // increment time
	time += dt;
  ptime += dt*pspeed;

  // redraw every now and then
  step += 1;
  if (step % 10 == 0)
  {
    // store stuff in history
    x_hist[hist_index] = x;
    act_hist[hist_index] = thrust;
  	wind_hist[hist_index] = wind_smooth*windlevel;
    hist_index++;
    if (hist_index == num_hist) hist_index = 0;
    // draw things
    step = 0;
  	clear();
	  draw();
  }
}

function draw()
{
  // save position and angle
	ctx.save();
  // draw rotation circle
  ctx.beginPath();
  ctx.arc(40,80, 20, 0, 2 * Math.PI, false);
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#bbbbbb';
  ctx.stroke();
	// move to hinge position
  ctx.translate(40,80);
  // rotate into arm coordinated
	ctx.rotate(-x);
  // draw arm
	ctx.fillStyle = '#3f5872';
	ctx.fillRect(0,-3, 100, 6);
  // draw motor
	ctx.fillStyle = 'black';
	ctx.fillRect(92,-3,8,-8);
  // draw prop
  ctx.fillStyle = '#672088';
  ctx.fillRect(96-plength,-10,plength*2,-2);
	ctx.restore();

  // live plot
  ctx.strokeStyle = '#bbbbbb';
  ctx.lineWidth = 2;
  ctx.moveTo(180,80);
  ctx.lineTo(380,80);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.moveTo(180,30);
  ctx.lineTo(180,130);
  ctx.stroke();

  ctx.strokeStyle = '#3f5872';
  ctx.lineWidth = 3;
  var ind, ind2;
  for (var ii=0; ii<num_hist-1; ii++)
  {
    ind = hist_index - ii - 1;
    if (ind < 0) ind += num_hist;
    ind2 = hist_index - ii - 2;
    if (ind2 < 0) ind2 += num_hist;
	ctx.beginPath();
    ctx.moveTo(180+ii*2,-80*x_hist[ind] + 80);
    ctx.lineTo(180+(ii+1)*2,-80*x_hist[ind2] + 80);
    ctx.stroke();
  }
  ctx.font="Bold 10px Arial";
  ctx.fillStyle = '#3f5872';
  ctx.fillText("ANGLE  =  "+(x*57.2957795131).toFixed(2)+"\u00B0",390,60);
  ctx.strokeStyle = '#672088';
  for (var ii=0; ii<num_hist-1; ii++)
  {
    ind = hist_index - ii - 1;
    if (ind < 0) ind += num_hist;
    ind2 = hist_index - ii - 2;
    if (ind2 < 0) ind2 += num_hist;
    ctx.beginPath();
    ctx.moveTo(180+ii*2,-50*act_hist[ind] + 80);
    ctx.lineTo(180+(ii+1)*2,-50*act_hist[ind2] + 80);
    ctx.stroke();
  }
  ctx.font="Bold 10px Arial";
  ctx.fillStyle = '#672088';
  ctx.fillText("THRUST",390,80);

  if (windlevel > 0)
  {  
	  ctx.strokeStyle = '#208288';
	  ctx.lineWidth = 2;
	  for (var ii=0; ii<num_hist-1; ii++)
  {
    ind = hist_index - ii - 1;
    if (ind < 0) ind += num_hist;
    ctx.beginPath();
    ctx.moveTo(180+ii*2,-5*wind_hist[ind] + 80);
    ind = hist_index - ii - 2;
    if (ind < 0) ind += num_hist;
    ctx.lineTo(180+(ii+1)*2,-5*wind_hist[ind] + 80);
    ctx.stroke();
  }
  ctx.fillStyle = '#208288';
  ctx.fillText("WIND",390,100);
  }

  // buttons
  ctx.font="Bold 12px Arial";
  
  ctx.fillStyle = '#76c7e5';
  ctx.fillRect(10,170,60,28);
  if (simrun==false) ctx.fillStyle = 'black';
  else ctx.fillStyle = 'gray';
  ctx.fillText("RUN",12,196);

  ctx.fillStyle = '#76e5c2';
  ctx.fillRect(10,200,60,28);
  if (simrun==false) ctx.fillStyle = 'gray';
  else ctx.fillStyle = 'black';
  ctx.fillText("POKE",12,226);

  ctx.fillStyle = '#d4e576';
  if (Math.abs(x) > 0.8) ctx.fillStyle = '#e2f867';
  ctx.fillRect(10,230,60,28);
  if (simrun==false) ctx.fillStyle = 'gray';
  else ctx.fillStyle = 'black';
  ctx.fillText("RESET",12,256);

  ctx.fillStyle = '#e59a76';
  ctx.fillRect(10,260,60,28);
  if (simrun==false) ctx.fillStyle = 'gray';
  else ctx.fillStyle = 'black';
  ctx.fillText("STOP",12,286);


  // sliders
  ctx.strokeStyle = '#bbbbbb';
  ctx.lineWidth = 5;
  ctx.moveTo(100,214);
  ctx.lineTo(400,214);
  ctx.stroke();
  ctx.moveTo(100,244);
  ctx.lineTo(400,244);
  ctx.stroke();
  ctx.moveTo(100,274);
  ctx.lineTo(400,274);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#dddddd';
  for (j=0; j<6; j++)
  {
	ctx.moveTo(100+j*300.0/5.0,204);
	ctx.lineTo(100+j*300.0/5.0,224);
	ctx.stroke();
	ctx.moveTo(100+j*300.0/5.0,234);
	ctx.lineTo(100+j*300.0/5.0,254);
	ctx.stroke();
	ctx.moveTo(100+j*300.0/5.0,264);
	ctx.lineTo(100+j*300.0/5.0,284);
	ctx.stroke();
  }

  // the slidey parts
  ctx.fillStyle = '#555555';
  ctx.fillRect(97+(logp+3)*300/5,205,5,16);
  ctx.fillRect(97+(logi+3)*300/5,235,5,16);
  ctx.fillRect(97+(logd+3)*300/5,265,5,16);

  // on off buttons
  ctx.strokeStyle = "#999999";
  ctx.lineWidth = 3;
  if (on_p)
	  ctx.fillStyle = '#83e171';
  else
	  ctx.fillStyle = '#e1aa9d';
  if (mode == 1) ctx.fillStyle = '#dddddd';
  ctx.beginPath();
  ctx.arc(420,214, 10, 0, 2 * Math.PI, false);
  ctx.stroke();
  ctx.fill();

  if (on_i)
	  ctx.fillStyle = '#83e171';
  else
	  ctx.fillStyle = '#e1aa9d';
  if (mode == 1) ctx.fillStyle = '#dddddd';
  ctx.beginPath();
  ctx.arc(420,244, 10, 0, 2 * Math.PI, false);
  ctx.stroke();
  ctx.fill();

  if (on_d)
	  ctx.fillStyle = '#83e171';
  else
	  ctx.fillStyle = '#e1aa9d';
  if (mode == 1) ctx.fillStyle = '#dddddd';
  ctx.beginPath();
  ctx.arc(420,274, 10, 0, 2 * Math.PI, false);
  ctx.stroke();
  ctx.fill();

  // text next to sliders
  ctx.fillStyle = '#333333';
  if (on_p)
	  ctx.fillText("P = "+P.toFixed(3),435,218);
  else 
	  ctx.fillText("P = 0.000",435,218);
  if (on_i)
	  ctx.fillText("I  = "+I.toFixed(3),437,248);
  else 
	  ctx.fillText("I  = 0.000",437,248);
  if (on_d)
	  ctx.fillText("D = "+D.toFixed(3),435,278);
  else
	  ctx.fillText("D = 0.000",435,278);

  // sim options
  ctx.strokeStyle = "#999999";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(260,180, 10, 0, 2 * Math.PI, false);
  ctx.stroke();
  ctx.fillStyle = "#83e171";
  if (windlevel == 1) ctx.fillStyle = "#e1d271";
  if (windlevel == 0) ctx.fillStyle = "#e1aa9d";
  ctx.fill();
  ctx.fillStyle = "#999999";
  ctx.fillText("WIND",275,185);

  ctx.strokeStyle = "#999999";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(330,180, 10, 0, 2 * Math.PI, false);
  ctx.stroke();
  ctx.fillStyle = "#83e171";
  if (noiselevel == 1) ctx.fillStyle = "#e1d271";
  if (noiselevel == 0) ctx.fillStyle = "#e1aa9d";
  ctx.fill();
  ctx.fillStyle = "#999999";
  ctx.fillText("NOISE",345,185);

  ctx.strokeStyle = "#999999";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(400,180, 10, 0, 2 * Math.PI, false);
  ctx.stroke();
  ctx.fillStyle = "#83e171";
  if (delaylevel == 1) ctx.fillStyle = "#e1d271";
  if (delaylevel == 0) ctx.fillStyle = "#e1aa9d";
  ctx.fill();
  ctx.fillStyle = "#999999";
  ctx.fillText("DELAY",415,185);

  // modes
  ctx.strokeStyle = "#999999";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(110,180, 10, 0, 2 * Math.PI, false);
  ctx.stroke();
  ctx.fillStyle = "#83e171";
  if (mode == 1) ctx.fillStyle = "#e1aa9d";
  ctx.fill();
  ctx.fillStyle = "#999999";
  ctx.fillText("PID",125,185);

  ctx.strokeStyle = "#999999";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(170,180, 10, 0, 2 * Math.PI, false);
  ctx.stroke();
  ctx.fillStyle = "#e1aa9d";
  if (mode == 1) ctx.fillStyle = "#83e171";
  ctx.fill();
  ctx.fillStyle = "#999999";
  ctx.fillText("NN",185,185);
}

function clear()
{
	ctx.fillStyle = '#666666';
	ctx.fillRect(0, 0, 500, 300);
	ctx.fillStyle = 'white';
	ctx.fillRect(3, 3, 494, 294);
}

function end()
{
	clearTimeout(timeout);
}


// sigmoid activation function
function sigmoid (x)
{
	return 1.0 / (1 + Math.exp(-x));
}

function nn(x, v, integral)
{
	var ik;

	// state -> 1st layer
	for (ik=0; ik<numneurons; ik++)
	{
		neuronval[ik] = theta0[ik][3] + x*theta0[ik][0] + v*theta0[ik][1] + integral*theta0[ik][2];
		neuronval[ik] = sigmoid(neuronval[ik])
	}
	// 1st layer -> output
	output = theta1[numneurons];
	for (ik=0; ik<numneurons; ik++)
	{
		output += theta1[ik] * neuronval[ik];
	}

  // sigmoid output
  return sigmoid(output);
}


function init_weights ()
{
theta0 = [[    1.976275,   -1.366728,    1.700507,   -3.611319,], 
[   -2.718360,    0.920997,   -2.848787,   -1.521753,], 
[   -0.989081,    1.298712,    3.945118,    3.952120,], 
[   -4.028871,   -2.565233,    4.868216,   -1.538942,], 
[   -3.087944,    0.891396,    4.424495,    4.366303,], 
[    3.198380,    4.393627,   -0.504058,   -2.511775,], 
[    0.551712,   -4.743971,   -3.173155,    0.151744,], 
[   -1.141901,   -7.053750,    1.027377,    0.189321,], 
[    0.127989,    0.108622,    1.252993,    1.121588,], 
[   -5.228032,    2.559772,   -4.717364,   -0.981179,], 
[   -0.188857,    4.477013,   -2.093361,    0.061968,], 
[   -3.431190,   -1.926970,    4.113407,   -4.903769,], 
[    3.873991,    5.828975,   -1.476212,   -0.031697,], 
[    3.280022,    2.635463,    1.835312,   -0.036636,], 
[    3.150733,    4.590076,   -3.890529,    0.662972,], 
[    4.586281,    3.076976,    4.345586,   -1.154782,], 
[   -2.727697,    0.866995,   -4.155793,   -5.323842,], 
[   -1.334027,   -5.003085,    0.700603,    2.820904,], 
[    4.252829,    3.453271,   -1.551479,   -4.979583,], 
[   -4.047869,   -1.751292,   -2.201864,    4.073380,]
];
theta1 = [   -2.486062,     1.175934,     1.552187,    -1.045564,    -1.654554,    -3.305333,     3.115497,     7.974597,    -2.353098,     1.547659,    -1.515346,    -3.339061,    -4.721977,    -2.425438,    -2.810513,    -1.993199,    -4.358187,     1.525320,     1.003176,     0.796318,     1.027897, ];
  console.log(nn(0.0, 0.0, 0.0))
}

init();
