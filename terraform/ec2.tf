# Graviton (arm64) AMI — Ubuntu 24.04, matches t4g instance_type family.
# Ships with an 8GB root snapshot (vs. 30GB on Amazon Linux 2023), so the
# volume below can stay small and cheap.
data "aws_ami" "ubuntu_arm64" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-arm64-server-*"]
  }

  filter {
    name   = "architecture"
    values = ["arm64"]
  }
}

resource "aws_instance" "app" {
  ami                    = data.aws_ami.ubuntu_arm64.id
  instance_type          = var.instance_type
  subnet_id              = data.aws_subnets.default.ids[0]
  vpc_security_group_ids = [aws_security_group.app.id]
  key_name               = aws_key_pair.deployer.key_name
  iam_instance_profile   = aws_iam_instance_profile.app.name

  # Persistent Spot request + "stop" on interruption: AWS stops (not
  # terminates) the instance, keeping the same instance-id/EBS volume,
  # so the Elastic IP below re-attaches automatically on restart.
  instance_market_options {
    market_type = "spot"
    spot_options {
      max_price                     = var.spot_max_price != "" ? var.spot_max_price : null
      spot_instance_type            = "persistent"
      instance_interruption_behavior = "stop"
    }
  }

  root_block_device {
    volume_type = "gp3"
    volume_size = 10
  }

  user_data = <<-EOF
    #!/bin/bash
    set -euxo pipefail
    apt-get update -y
    apt-get install -y docker.io
    systemctl enable --now docker
    usermod -aG docker ubuntu
  EOF

  tags = {
    Name = var.project_name
  }
}

resource "aws_eip" "app" {
  domain = "vpc"
  tags = {
    Name = "${var.project_name}-eip"
  }
}

resource "aws_eip_association" "app" {
  instance_id   = aws_instance.app.id
  allocation_id = aws_eip.app.id
}
