# data "archive_file" "function_package" {
#   type = "zip"
#   source_dir = "${path.module}/../../git_function/${var.git_func_path}"
#   output_path = "${path.module}/function.zip"
  
#   depends_on = [
#     random_string.random
#   ]
# }

# resource "random_string" "random" {
#   length = 16
#   special = true
#   override_special = "/@£$"
# }
