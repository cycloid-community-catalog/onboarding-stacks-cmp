#!/bin/bash
# Install K3s if enabled
if [[ "$INSTALL_K3S" -eq "true" ]]; then
    curl -sfL https://get.k3s.io | K3S_KUBECONFIG_MODE='644' INSTALL_K3S_EXEC='--disable traefik --disable servicelb --tls-san $(curl ipaddr.fr)' sh -s -
    until ls /etc/rancher/k3s/k3s.yaml >/dev/null; do sleep 1; done
    mkdir -p /home/${USERNAME}/.kube
    cp /etc/rancher/k3s/k3s.yaml /home/${USERNAME}/.kube/config
    chmod 644 /home/${USERNAME}/.kube/config
    chown ${USERNAME}:${USERNAME} /home/${USERNAME}/.kube/config
    cp /etc/rancher/k3s/k3s.yaml /home/${USERNAME}/.kube/public_ip_config
    sed -i "s/127.0.0.1/$(curl ipaddr.fr)/" /home/${USERNAME}/.kube/public_ip_config
    chmod 644 /home/${USERNAME}/.kube/public_ip_config
    chown ${USERNAME}:${USERNAME} /home/${USERNAME}/.kube/public_ip_config
    cd /tmp
    curl -sL https://get.helm.sh/helm-v3.17.1-linux-amd64.tar.gz | tar -xvz
    sudo mv linux-amd64/helm /usr/bin/helm
    sudo chmod +x /usr/bin/helm
    rm -rf linux-amd64
    export KUBECONFIG=/home/${USERNAME}/.kube/config
    helm upgrade --set controller.hostPort.enabled=true --install ingress-nginx ingress-nginx --repo https://kubernetes.github.io/ingress-nginx --namespace ingress-nginx --create-namespace
fi