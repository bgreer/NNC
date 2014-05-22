
learn : main.c
	gcc -O2 -o learn -I./FANN/ -I./FANN/include main.c FANN/floatfann.c -lm

gausstest : gausstest.c
	gcc -O2 -o gausstest -I./FANN/ -I./FANN/include gausstest.c FANN/floatfann.c -lm

dataset : dataset.c
	gcc -O2 -o dataset dataset.c -lm
