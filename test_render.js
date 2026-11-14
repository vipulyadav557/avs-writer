const express=require('express');
const app=express();
app.set('view engine','ejs');
app.set('views','E:/test/website/views');
app.get('/',(req,res)=>res.render('pages/index',{title:'AVS Writer',poems:require('./data/samples'),bannerUrl:require('./config/site').poetryBannerUrl}));
app.use((err,req,res,next)=>{ console.error('ERR:',err); res.status(500).send('ERR:'+err.message); });
app.listen(3001,()=>console.log('listening'));