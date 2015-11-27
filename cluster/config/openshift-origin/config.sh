#!/bin/bash

set -e

echo
echo "===> Initializing:"
if [ ! $(which python) ]
then
	echo "Python is a prerequisite for running this script. Please install Python and try running again."
	exit 1
fi

if [ ! $(which gcloud) ]
then
	echo "gcloud is a prerequisite for running this script. Please install gcloud and try running again."
	exit 1
fi

gcloud_instances=$(gcloud compute instances list | grep "\-master")
if [ -z "$gcloud_instances" ] || [ -z "${KUBE_GCE_INSTANCE_PREFIX}" ]
then
	echo "This script is only able to supply the necessary serviceaccount key if you are running on Google"
	echo "Compute Engine using a cluster/kube-up.sh script with KUBE_GCE_INSTANCE_PREFIX set. If this is not"
	echo "the case, be ready to supply a path to the serviceaccount public key."
	if [ -z "${KUBE_GCE_INSTANCE_PREFIX}" ]
	then
    export KUBE_GCE_INSTANCE_PREFIX=kubernetes
	fi
fi

export OPENSHIFT_EXAMPLE=$(pwd)
echo Set OPENSHIFT_EXAMPLE=${OPENSHIFT_EXAMPLE}
export OPENSHIFT_CONFIG=${OPENSHIFT_EXAMPLE}/config
echo Set OPENSHIFT_CONFIG=${OPENSHIFT_CONFIG}


echo "===> Configuring OpenShift:"
docker run -it --privileged -e KUBECONFIG=/kubeconfig -v ${HOME}/.kube/config:/kubeconfig -v ${OPENSHIFT_CONFIG}:/config openshift/origin:v1.0.3 cli secrets new openshift-config /config -o json &> ${OPENSHIFT_EXAMPLE}/secret.json
kubectl --context=paralin-2_kubernetes --validate=false create -f ${OPENSHIFT_EXAMPLE}/secret.json --namespace='openshift-origin'
echo

echo "===> Running OpenShift Master:"
kubectl --context=paralin-2_kubernetes --validate=false create -f ${OPENSHIFT_EXAMPLE}/openshift-controller.yaml --namespace='openshift-origin'
echo

echo Done.
