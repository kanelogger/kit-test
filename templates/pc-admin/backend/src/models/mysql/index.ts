/** 创建用户表 */
const user =
  "CREATE TABLE if not EXISTS users(id int PRIMARY key auto_increment,username varchar(32),password varchar(32),time DATETIME)";

/** 默认管理员账号，让模板首次启动即可登录 */
const initUser =
  "INSERT IGNORE INTO users(username, password, time) VALUES ('admin', '0192023a7bbd73250516f069df18b500', NOW())";

export { user, initUser };
