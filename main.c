
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include "FANN/include/fann.h"

#define TWOPI 6.28318530718
#define PI 3.14159265359

// prototypes:
float gauss_rand();
void map_nn (int numinputs, struct fann *ann);
void sim_step (float step, float action, float *x, float *v, float *integral);
void test_system (struct fann *ann, FILE *fp);
void condition_nn (struct fann *ann);

/* tuning parameters:
 - NN size / structure
 - NN learning rates
 - action random exploration
 - discount factor
 - reward function
 - tderror threshold
*/

int main (int argc, char *argv[])
{
  FILE *fp, *fp2, *fp_trials, *fp_test;
	int ii, ij, numinputs;
  fann_type *input, *input2, *output, *output2, *temp;
  fann_type *predicted_reward, *optimal_action, *predicted_future_reward;
  struct fann *vnn;
  struct fann *ann; // value nn, actor nn

  float explore;
  float reward, action, tderror, tdvar;
  float totalreward;
  int niter, iter, success;
  int updates;
  float zp;

  // real-world stuff
  int simdone, step;
  float stime, dt, time0;
  float thrust, x, v, integral, a;
  float measx, measv;
  float x0, v0;
  float discount, delay;
  char junk;

  srand(1234);

  numinputs = 3;
  thrust = 0.0;
  x = 0.0; v = 0.0; a = 0.0;
  dt = 0.0003; // 1 ms
  step = 0;

  niter = 5000;

  // vnn, the value neural network, tries to approximate the reward function
  // ann, the actor neural network, tries to determine the optimal action to perform

  // set parameters
  input = (fann_type*) malloc(numinputs * sizeof(fann_type));
  input2 = (fann_type*) malloc(numinputs * sizeof(fann_type));
  output = (fann_type*) malloc(1 * sizeof(fann_type));
  output2 = (fann_type*) malloc(1 * sizeof(fann_type));

  // create each NN
  if (argc > 1)
  {
    printf("Loading NNs from file..\n");
    vnn = fann_create_from_file("vnn.net");
    ann = fann_create_from_file("ann.net");
    explore = atof(argv[1]);
    input[0] = 0.0;
    input[1] = 0.0;
    input[2] = 0.0;
    output = fann_run(ann, input);
    zp = output[0];
    printf("Zero-point action = %f\n", zp);
    input[0] = -0.01/PI;
    output = fann_run(ann, input);
    printf("P = %f\n", (output[0]-zp)/0.001);
    input[0] = 0.0; input[1] = -0.01/20.0;
    output = fann_run(ann, input);
    printf("D = %f\n", (output[0]-zp)/0.001);
    input[1] = 0.0; input[2] = -0.01/10000.0;
    output = fann_run(ann, input);
    printf("I = %f\n", (output[0]-zp)/0.001);
    exit(-1);
  } else {
    vnn = fann_create_standard(4, numinputs, 50, 20, 1);
  	ann = fann_create_standard(3, numinputs, 20, 1);

  	fann_set_training_algorithm(vnn, FANN_TRAIN_INCREMENTAL);
  	fann_set_training_algorithm(ann, FANN_TRAIN_INCREMENTAL);
   // set activation functions
  	fann_set_activation_function_hidden(vnn, FANN_SIGMOID);
  	fann_set_activation_function_output(vnn, FANN_LINEAR);
  	fann_set_activation_function_hidden(ann, FANN_SIGMOID);
  	fann_set_activation_function_output(ann, FANN_SIGMOID);

    fann_randomize_weights(vnn, -5.0, 5.0);
  	fann_randomize_weights(ann, -5.0, 5.0);

    fann_set_learning_rate(vnn, 0.6);
    fann_set_learning_rate(ann, 0.03);

    fann_set_learning_momentum(vnn, 0.0);
    fann_set_learning_momentum(ann, 0.0);

    explore = 0.15;

    // pre-condition ann
    condition_nn(ann);
//    map_nn(3,ann);
  }

  // for best results, scale inputs and outputs to [0,1]
  // input for vnn and ann are sensor values
  // output for vnn is reward
  // output for ann is an action, possibly a motor value?

  // 0.90 seems to work ok
  discount = 0.90;

  delay = pow(7.0, -2.0);

  // begin training
  fp = fopen("plot", "w");
  fp2 = fopen("examples", "w");
  fp_trials = fopen("trials", "w");
  fp_test = fopen("test", "w");

  // loop over trials
  for (ii=0; ii<10000; ii++)
  {
    // initialize sim
    x = (((rand()%10000)/10000.0)-0.5)*PI*0.3;
    v = (((rand()%10000)/10000.0)-0.5)*PI*0.4;
    integral = 0.0;
    x0 = x;
    v0 = v;

    tdvar = 0.05;

    totalreward = 0.0;

    // how long to run sim
    for (iter=0; iter<niter; iter++)
    {
      measx = x;// + ((rand()%10000)/10000.0-0.5)*0.10;
      measv = v;// + ((rand()%10000)/10000.0-0.5)*0.10;
      // decide best action
      input[0] = measx/PI;
      input[1] = measv/20.0;
      input[2] = integral/10000.0;

      predicted_reward = fann_run(vnn, input);
      optimal_action = fann_run(ann, input);
      
      // add noise to action?
      action = optimal_action[0];
      if (rand()%100 < 20) action += gauss_rand()*explore * (1.0-((float)iter)/((float)niter));
      
      // pid
//      action = -3.0*input[0] - 7.0*input[1] - 0.0*input[2];
      
      if (action < 0.0) action = 0.0;
      if (action > 1.0) action = 1.0;


      // let simulation run a moment
      sim_step (0.02, action, &x, &v, &integral);
      
      // if we've died
      if (x < -PI/2.0 || x > PI/2.0)
      {
        reward = -0.75;
        iter = niter;
      } else {
        // environment computes reward
        reward = (((float)iter)/((float)niter)) * exp(-x*x*16.0) * exp(-v*v*16.0);
//        reward = (((float)iter)/((float)niter)) - (x*x) - (v*v);
//        reward = exp(-x*x*2.0) * exp(-v*v*2.0);
        if ( reward < 0.0) reward = 0.0;
      }
      totalreward += reward;

      // predicted reward past this new point
      input2[0] = measx/PI;
      input2[1] = measv/20.0;
      input2[2] = integral/10000.0;
      predicted_future_reward = fann_run(vnn, input2);

      // the difference in predicion should be compared to received reward
      tderror = reward + discount*predicted_future_reward[0] - 
                predicted_reward[0];

      // update vnn at previous state
      output[0] = reward + discount*predicted_future_reward[0];
      fann_train(vnn, input, output);


      // update ann if appropriate
      updates = 0;
      if (tderror > 0.05)
      {
        updates = (int) floor(tderror / (sqrt(tdvar)*0.5));
        updates = 1;
//        printf("%d %d\n", ii, updates);
        // check
//        output = fann_run(ann, input);
//        zp = output[0];

        output[0] = action;
        for (ij=0; ij<updates; ij++)
          fann_train(ann, input, output);
//       output = fann_run(ann, input);
//       if (output[0]-zp != 0.0) printf("debug %f %f %e %f\n", zp, output[0], zp - output[0], action);
//        fprintf(fp2, "%d\t%f\t%f\t%f\t%f\n", ii, input[0], input[1], output[0], tderror);
      }

      if (ii%50==0 && iter%10==0)
      {
        fprintf(fp, "%d\t%d\t%f\t%f\t%f\t%f\t%f\t%f\t%f\t%d\n", ii, iter, input[0], input[1], input[2], action, reward, tderror, sqrt(tdvar), updates);
        fprintf(fp2, "%d\t%f\t%f\t%f\t%f\n", ii, input[0], input[1], output[0], predicted_reward[0]);
      }
      
      tdvar = 0.9*tdvar + 0.1*tderror*tderror;

    }

    if (ii%50==0) test_system(ann, fp_test);
    fprintf(fp_trials, "%d\t%f\t%f\t%f\t%f\n", ii, totalreward, x0, v0, x);

//    if (iter==niter) explore -= 0.0001;

    input2[0] = 0.0;
    input2[1] = 0.0;
    input2[2] = 0.0;
    output2 = fann_run(ann, input2);
    zp = output2[0];
    printf("Iter %d Zero-point action = %f\n", ii, zp);
    input2[0] = -0.01/PI;
    output2 = fann_run(ann, input2);
    printf("P = %f\n", (output2[0]-zp)/0.001);
    input2[0] = 0.0; input2[1] = -0.01/20.0;
    output2 = fann_run(ann, input2);
    printf("D = %f\n", (output2[0]-zp)/0.001);
    input2[1] = 0.0; input2[2] = -0.01/10000.0;
    output2 = fann_run(ann, input2);
    printf("I = %f\n", (output2[0]-zp)/0.001);

//    fann_print_connections(ann);
  }
  fclose(fp);
  fclose(fp2);
  fclose(fp_trials);
  fclose(fp_test);

  // test it
//  map_nn(3, ann);


  // save nns
  fann_save(ann, "ann.net");
	fann_destroy(ann);
  fann_save(vnn, "vnn.net");
  fann_destroy(vnn);

  free(input);
  free(input2);
  free(output);
}

// tell the actor nn what a pid controller is like
void condition_nn (struct fann *ann)
{
  fann_type *input, *output;
  int ii, trials;

  input = (fann_type*) malloc(3 * sizeof(fann_type));
  output = (fann_type*) malloc(1 * sizeof(fann_type));

  trials = 100000;

  for (ii=0; ii<trials; ii++)
  {
    input[0] = ((rand()%10000)/10000.0-0.5);
    input[1] = ((rand()%10000)/10000.0-0.5);
    input[2] = ((rand()%10000)/10000.0-0.5);
    output[0] = -3.0*input[0] - 7.0*input[1] - 0.001*input[2] + 0.58;
    if (output[0] > 1.0) output[0] = 1.0;
    if (output[0] < 0.0) output[0] = 0.0;
    fann_train(ann, input, output);
  }
}


float gauss_rand()
{
  int ii;
  float ret;

  ret = ((rand()%10000)/10000.0-0.5);
  for (ii=0; ii<10; ii++)
    ret += ((rand()%10000)/10000.0-0.5);
  return ret;
}

void map_nn (int numinputs, struct fann *ann)
{
  FILE *fp;
  fann_type *input, *output;
  int ii;

  input = (fann_type*) malloc(numinputs * sizeof(fann_type));

  fp = fopen("map", "w");
  for (ii=0; ii<10000; ii++)
  {
    input[0] = (rand()%10000/10000.0)-0.5;
    input[1] = (rand()%10000/10000.0)-0.5;
    input[2] = (rand()%10000/10000.0)-0.5;
    output = fann_run(ann, input);
    fprintf(fp, "%d\t%f\t%f\t%f\t%f\n", ii, input[0], input[1], input[2], output[0]);
  }
  fclose(fp);

  free(input);
}

void sim_step (float step, float action, float *x, float *v, float *integral)
{
  float a, stime, dt;
  dt = 0.0003;
  for (stime=0.0; stime<step; stime+=dt)
  {
    a = 1.5*(action-0.5); // thrust
    a -= 0.3 * cos(*x); // gravity
    *v += a * dt;
    *x += *v * dt;
    *integral += *x;
  }
}

void test_system (struct fann *ann, FILE *fp)
{
  float x, v, integral;
  int iter, niter;
  fann_type *input, *action;

  input = (fann_type*) malloc(3 * sizeof(fann_type));
  action = (fann_type*) malloc(1 * sizeof(fann_type));

  niter = 1500;


  x = (((rand()%10000)/10000.0)-0.5)*PI*0.3;
  v = (((rand()%10000)/10000.0)-0.5)*PI*0.4;
  x = 0.0;
  v = 0.0;
  integral = 0.0;
  // how long to run sim
  for (iter=0; iter<niter; iter++)
  {
    // decide best action
    input[0] = x/PI;
    input[1] = v/20.0;
    input[2] = integral/10000.0;

    action = fann_run(ann, input);

    // let simulation run a moment
    sim_step (0.01, action[0], &x, &v, &integral);

    fprintf(fp, "%d\t%f\t%f\t%f\t%f\n", iter, x, v, integral, action[0]);
      
    // if we've died
    if (x < -PI/2.0 || x > PI/2.0)
        iter = niter;

  }


  free(input);
}

