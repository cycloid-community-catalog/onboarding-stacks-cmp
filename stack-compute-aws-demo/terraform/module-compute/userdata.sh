#!/bin/bash
# To install SSM Agent on Debian Server
# https://docs.aws.amazon.com/systems-manager/latest/userguide/agent-install-deb.html
mkdir /tmp/ssm
cd /tmp/ssm
wget https://s3.amazonaws.com/ec2-downloads-windows/SSMAgent/latest/debian_amd64/amazon-ssm-agent.deb
dpkg -i amazon-ssm-agent.deb
systemctl status amazon-ssm-agent
systemctl enable amazon-ssm-agent
systemctl start amazon-ssm-agent
# Install K3s if enabled
if [[ "$INSTALL_K3S" -eq "true" ]]; then
    curl -sfL https://get.k3s.io | K3S_KUBECONFIG_MODE='644' INSTALL_K3S_EXEC='--disable traefik --disable servicelb --tls-san $(curl http://169.254.169.254/latest/meta-data/public-ipv4)' sh -s -
    until ls /etc/rancher/k3s/k3s.yaml >/dev/null; do sleep 1; done
    mkdir -p /home/${USERNAME}/.kube
    cp /etc/rancher/k3s/k3s.yaml /home/${USERNAME}/.kube/config
    chmod 644 /home/${USERNAME}/.kube/config
    chown ${USERNAME}:${USERNAME} /home/${USERNAME}/.kube/config
    cp /etc/rancher/k3s/k3s.yaml /home/${USERNAME}/.kube/public_ip_config
    sed -i "s/127.0.0.1/$(curl http://169.254.169.254/latest/meta-data/public-ipv4)/" /home/${USERNAME}/.kube/public_ip_config
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