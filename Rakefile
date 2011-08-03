desc "Start node for rails application specs"
task :spec_node do
  ENV["REDIS_DB"] ||= "1"
  ENV["PGS_PORT"] ||= "3666"
  system("node server.js")
end

task :default => :spec_node
