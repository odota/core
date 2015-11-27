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
mkdir -p ${OPENSHIFT_CONFIG}
echo Made dir ${OPENSHIFT_CONFIG}
echo

export PUBLIC_OPENSHIFT_IP=""
echo "===> Waiting for public IP to be set for the OpenShift Service."
echo "Mistakes in service setup can cause this to loop infinitely if an"
echo "external IP is never set. Ensure that the OpenShift service"
echo "is set to use an external load balancer. This process may take" 
echo "a few minutes. Errors can be found in the log file found at:"
echo ${OPENSHIFT_EXAMPLE}/openshift-startup.log
echo "" > ${OPENSHIFT_EXAMPLE}/openshift-startup.log
while [ ${#PUBLIC_OPENSHIFT_IP} -lt 1 ]; do
	echo -n .
	sleep 1
	{
		export PUBLIC_OPENSHIFT_IP=$(kubectl get services openshift --namespace="openshift-origin" --template="{{ index .status.loadBalancer.ingress 0 \"ip\" }}")
	} >> ${OPENSHIFT_EXAMPLE}/openshift-startup.log 2>&1
	if [[ ! ${PUBLIC_OPENSHIFT_IP} =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
		export PUBLIC_OPENSHIFT_IP=""
	fi
done
echo
echo "Public OpenShift IP set to: ${PUBLIC_OPENSHIFT_IP}"
echo

cp master-config.yaml ./config/master-config.yaml

echo "===> Configuring OpenShift:"
docker run -it --privileged -e KUBECONFIG=/kubeconfig -v ${HOME}/.kube/config:/kubeconfig -v ${OPENSHIFT_CONFIG}:/config openshift/origin:v1.0.3 cli secrets new openshift-config /config -o json &> ${OPENSHIFT_EXAMPLE}/secret.json
kubectl --validate=false replace -f ${OPENSHIFT_EXAMPLE}/secret.json --namespace='openshift-origin'
echo

#echo "===> Running OpenShift Master:"
#kubectl --validate=false create -f ${OPENSHIFT_EXAMPLE}/openshift-controller.yaml --namespace='openshift-origin'

echo Done.
