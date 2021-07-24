import React,{useEffect,useState,useRef,useCallback} from 'react';
import {io} from "socket.io-client";
import {makeStyles} from "@material-ui/core/styles";
import "./Room.scss";
import {
    Paper,
    InputBase,
    List,
    ListSubheader,
    ListItem,
    ListItemText,
    Typography,
    ListItemSecondaryAction,
    IconButton,
    Button,
    Divider,
    InputAdornment,
    Tooltip,
    ClickAwayListener,
} from "@material-ui/core";
import {
    MicRounded as MicrophoneIcon,
    SendRounded as MessageIcon,
    DesktopMacRounded as DesktopIcon,
    DesktopAccessDisabled as DesktopDesableIcon,
    MicOffRounded as MicrophoneDisableIcon,
    CheckRounded as TickIcon,
    Close as CloseIcon,
    Gesture as GestureIcon,
    ShowChartTwoTone as LineIcon,
    Crop75 as SquareIcon,
    FiberManualRecordOutlined as CircleIcon,
    TextFields as TextIcon,
    InsertPhoto as ImageIcon,
    ColorLens as ColorIcon
    // StarRate as StarIcon,
    // CallEndRounded as HangupIcon,
} from "@material-ui/icons";
import Rating from '@material-ui/lab/Rating';
import { BlockPicker } from 'react-color'

const SOCKET_ENDPOINT="http://localhost:5001";
const colorsArr=["#000000","#E53935","#CFD8DC","#8E24AA","#303F9F","#0097A7","#FFEB3B","#76FF03","#4FC3F7","#CE93D8"];

const useStyle = makeStyles(theme=>{
    return {
        nav:{
            position:"fixed",
            width:"100%",
            bottom:"0",
            background:"#111",
            height:"65px",
            display:"flex",
            alignItems:"center",
            justifyContent:"center",
            
            "& button":{
                color:"#fff",
                margin:"0 10px",
                background:"#333",

            },
            "& .bgRed":{
                background:"#f00",
                "&:hover":{
                    filter:"brightness(.8)"
                }
            },
        },
        sidebar:{
            display:"flex",
            flexDirection:"column",
            position:"fixed",
            width:"420px",
            height:"calc(100vh - 65px)",
            right:"0",
            top:"0",
            
            "& .form":{
                display:"flex",
            },
            "& .input":{
                flexGrow:"1",
                padding:`5px ${theme.spacing(1)}px`,
            },
            "& .messages":{
                overflowY:"scroll",
                flexGrow:1
            },
            "& .listHeader, & .form":{
                background:"#21242B" //dark background 
            }
        },

    }
})




class Message{
    constructor(id,sender,text,date,role,rate,hardness,repliedID){
        this.id=id;
        this.sender=sender;
        this.text=text;
        this.date=new Date(date);
        this.role=role;
        this.rate=rate;
        this.hardness=hardness;
        this.repliedID=repliedID;
    }
}
class VidStream{
    constructor(stream,target,username){
        this.stream=stream;
        this.target=target;
        this.username=username;
    }
}
class User{
    constructor(username,connectionID){
        this.username=username;
        this.connectionID = connectionID;
    }
}

const captureWebcam=()=> {
    return new Promise((resolve,reject) => {
        navigator.mediaDevices.getUserMedia({video:true,audio:true})
        .then(currentStream=>{
            resolve(currentStream);
        })
        .catch(() =>{
            reject();
        })
    });
}

const toggleStreamTrack=(stream,type,enabled)=>{
    /* 
    toggle video or audio of stream ; also remote peers tracks will disable  
    usage: toggleStreamTrack(localStream,'video',true); 
    */
    if(stream){ //if stream was not null or undefined
        stream.getTracks().forEach((track)=>{
            if(track.kind===type){
                track.enabled=enabled
            }
        })
    }
}
const captureScreen=()=>{
    return new Promise((resolve, reject) =>{
        /*
        {
            video:{
                width:1920,
                height:1080,
                frameRate: { ideal: 15, max: 20 }}
        }
        */
        navigator.mediaDevices.getDisplayMedia({video:true})
        .then(currentStream=>{
            resolve(currentStream);
        })
        .catch(() =>{
            reject();
        })

    }) 
        
}

const ChatListItem=({id,role,onClick,text,date,sender,hardness,repliedText,isAdmin,ratingOnChange,rate})=>{
    let isButton= false;
    const classes=[];
    let primaryText;
    if(role==="question"){
        isButton= true;
        classes.push("question");
        primaryText=`Question (Hardness: ${hardness})`;
    }
    else if(role==="answer"){
        classes.push("answer");
        primaryText=`${sender} (Replied to: ${repliedText})`;
    }
    else{
        primaryText=sender;
    }
    const [value,setValue]=useState(rate);
    
    return (
        <ListItem 
            button={isButton} 
            onClick={onClick}
        >
            <ListItemText 
                className={classes.join(" ")}
                primary={primaryText}
                secondary={
                    <>
                        <Typography component="span" style={{display:"block"}} variant={"body2"} noWrap color="textSecondary" >
                            {text}
                        </Typography>
                        {
                            role==="answer" && isAdmin &&
                            <Rating
                                className="rating"
                                name={`answer-rating${id}`}
                                value={value}
                                onChange={(e,newVal)=>{
                                    setValue(newVal);
                                    ratingOnChange(newVal);
                                }}
                                size="small"
                            />
                        }
                        {
                            role==="answer" && !isAdmin &&
                            <Rating
                                className="rating"
                                name={`answer-rating${id}`}
                                value={rate}
                                size="small"
                                readOnly
                            />
                        }
                    </>
                    
                }/>
            <ListItemSecondaryAction>
                <div className="status">
                    {date.getHours() + ":" + date.getMinutes()}
                </div>
            </ListItemSecondaryAction>
        </ListItem>
    )
}



export default function Room(props) {
    const [room,setRoom] = useState("room1");
    const [messageInput,setMessageInput] = useState("");
    const [usernameInput,setUsernameInput] = useState("");
    const [desktopIsSharing,setDesktopIsSharing]=useState(false);
    const [micIsSharing,setMicIsSharing]=useState(true);
    const [isCanvasSharing,setIsCanvasSharing]=useState(false);
    const [chats,setChats] = useState([]);
    const [users,setUsers] = useState([]);
    const [isJoinedRoom,setIsJoinedRoom] = useState(false);
    const [streams,setStreams]= useState([]);
    const [selfStream,setSelfStream] = useState(null);
    const [selfUsernameInRoom,setSelfUsernameInRoom] = useState(null);
    const [isAdmin,setIsAdmin]=useState(false);
    const [isQuestion,setIsQuestion] = useState(false);
    const [questionHardness,setQuestionHardness] = useState(5);
    const [selectedQuestionID,setSelectedQuestionID] = useState(null);
    const [selectedCanvasButton,setSelectedCanvasButton] = useState(4);
    const [pickedColor,setPickedColor]= useState(colorsArr[0]);
    const [showColorPicker,setShowColorPicker]=useState(false);

    const socketRef=useRef(null);
    const connectionsRef=useRef({});
    const whiteboardRef=useRef(null);
    const fileInputRef=useRef(null);
    const messageInputRef = useRef(null);
    const messageContainerRef= useRef(null);
    
    const classes=useStyle();

    
    const handleNegotiationNeeded=async(pc)=> {
        const offer=await pc.createOffer();
        await pc.setLocalDescription(offer);
        socketRef.current.emit('offer',{
            offer:pc.localDescription,
            target:pc.target
        });
    }
    const addStreams=useCallback((e,target,username)=>{
        console.log('addstreams ',username);
        const newStream= new VidStream(e.streams[0],target,username);
        setStreams((last)=>{
            const newVal=last.filter(val=>val.stream.id !==newStream.stream.id);
            return [...newVal,newStream];
        });
    },[]);
    const handleICECandidateEvent=useCallback((e,pc)=>{
        if(e.candidate){
            socketRef.current.emit("ice-candidate", {
                target:pc.target,
                candidate:e.candidate
            });
        }  
    },[]);

    const createPeer=(target,username)=>{
        const peer=new RTCPeerConnection({
            iceServers: [
                {
                    urls: "stun:stun.stunprotocol.org"
                },
                {
                    urls: 'turn:numb.viagenie.ca',
                    credential: 'muazkh',
                    username: 'webrtc@live.com'
                },
            ]
        });
        peer.onicecandidate = (e)=>{handleICECandidateEvent(e,peer)};
        peer.ontrack = (e)=>{addStreams(e,target,username)};
        peer.onnegotiationneeded = () =>{handleNegotiationNeeded(peer)};
        peer.target=target;

        return peer;
    };


    const shareDesktop=async()=>{
        const tempStream = await captureScreen();
        
        for(const key in connectionsRef.current){
            tempStream.getTracks().forEach((track)=>{
                connectionsRef.current[key].addTrack(track,tempStream);
            });
        }
        setSelfStream(tempStream);
        
    }

    const addDrawEvent=(myCanvas)=>{
        const ctx = myCanvas.getContext("2d");

        let isDrawing = false;
        let x = 0;
        let y = 0;


        const drawLine=(ctx, x1, y1, x2, y2) =>{
            ctx.beginPath();
            // ctx.strokeStyle = '#f00';
            ctx.lineWidth = 3;
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
            ctx.closePath();
        }

        myCanvas.onmousedown= (e) => {
            x = e.offsetX;
            y = e.offsetY;
            isDrawing = true;
        }
        
        
        myCanvas.onmousemove= (e) => {
            if (isDrawing === true) {
                drawLine(ctx, x, y, e.offsetX, e.offsetY);
                x = e.offsetX;
                y = e.offsetY;
            }
        }
        
        myCanvas.onmouseup = (e) => {
            if (isDrawing === true) {
                drawLine(ctx, x, y, e.offsetX, e.offsetY);
                x = 0;
                y = 0;
                isDrawing = false;
            }
        }
    }
    const drawText=(myCanvas)=>{
        const ctx = myCanvas.getContext("2d");
        let x = 0;
        let y = 0;

        myCanvas.onclick=(e)=>{
            x = e.offsetX;
            y = e.offsetY;
            const text =prompt('Enter Text');
            // ctx.fillStyle = "#f00";
            ctx.font = "20px Arial";
            ctx.fillText(text, x, y);
        }



    }
    const clearCanvas=(myCanvas)=>{
        const ctx=myCanvas.getContext("2d");
        const prevColor=ctx.fillStyle;
        ctx.clearRect(0, 0, myCanvas.width, myCanvas.height);
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, whiteboardRef.current.width, whiteboardRef.current.height);

        ctx.fillStyle=prevColor;
        
    }
    const drawEllipse=(ctx,x1, y1, x2, y2)=> {

        let radiusX = (x2 - x1) * 0.5,   /// radius for x based on input
            radiusY = (y2 - y1) * 0.5,   /// radius for y based on input
            centerX = x1 + radiusX,      /// calc center
            centerY = y1 + radiusY,
            step = 0.01,                 /// resolution of ellipse
            a = step,                    /// counter
            pi2 = Math.PI * 2 - step;    /// end angle
        
        ctx.beginPath();
    
        /// set start point at angle 0
        ctx.moveTo(centerX + radiusX * Math.cos(0),
                   centerY + radiusY * Math.sin(0));
    
        /// create the ellipse    
        for(; a < pi2; a += step) {
            ctx.lineTo(centerX + radiusX * Math.cos(a),
                       centerY + radiusY * Math.sin(a));
        }
        
        ctx.closePath();
        ctx.stroke();
    }
    
    const drawCircle=(myCanvas)=>{
        const ctx=myCanvas.getContext("2d");
        let x1;
        let y1;
    
        myCanvas.onmouseup = (e)=> {
            /// get corrected mouse position and store as first point
            var rect = myCanvas.getBoundingClientRect();
            
            const x2 = e.clientX - rect.left
            const y2 = e.clientY - rect.top;
            drawEllipse(ctx,x1, y1, x2, y2);
        }
        
        myCanvas.onmousedown = (e)=> {
            var rect = myCanvas.getBoundingClientRect();
            x1 = e.clientX - rect.left;
            y1 = e.clientY - rect.top;
        }
    }
    const drawLine=(myCanvas)=>{
        const ctx=myCanvas.getContext("2d");
        let x1=0,y1=0;

        myCanvas.onmousedown=(e)=>{
            x1=e.offsetX;
            y1=e.offsetY;
        }
        myCanvas.onmouseup=(e)=>{
            let x2=e.offsetX;
            let y2=e.offsetY;
            ctx.beginPath();
            ctx.lineWidth = '3'; // width of the line
            // ctx.strokeStyle = '#f00'; // color of the line
            ctx.moveTo(x1,y1); // begins a new sub-path based on the given x and y values.
            ctx.lineTo(x2, y2); // used to create a pointer based on x and y  
            ctx.stroke(); // this is where the actual drawing happens.
        }

    }
    const removeEvents=(myCanvas)=>{
        myCanvas.onmousedown=null;
        myCanvas.onmousemove=null
        myCanvas.onmouseup=null;
        myCanvas.onclick=null;
    }

    const setCanvasColors=(myCanvas,color)=>{
        const ctx= myCanvas.getContext("2d");
        ctx.strokeStyle=color;
        ctx.fillStyle=color;

    }
    useEffect(()=>{
        setCanvasColors(whiteboardRef.current,pickedColor.hex);
    },[pickedColor]);
    const drawRect=(myCanvas)=>{
        const ctx=myCanvas.getContext("2d");
        let x=0,y=0;

        myCanvas.onmousedown=(e)=>{
            x=e.offsetX;
            y=e.offsetY;
        }

        myCanvas.onmouseup=(e)=>{
            let width= e.offsetX - x;
            let height= e.offsetY - y;
            ctx.beginPath();
            // ctx.strokeStyle = "#f00";
            ctx.rect(x, y, width, height);
            ctx.stroke();
        }
    }
    
    const shareWhiteboard=()=>{
        //initiate canvas
        // drawLine(whiteboardRef.current);
        // drawRect(whiteboardRef.current);
        // drawCircle(whiteboardRef.current);
        // drawText(whiteboardRef.current);
        
        clearCanvas(whiteboardRef.current);
        addDrawEvent(whiteboardRef.current);        


        
        const canvasStream = whiteboardRef.current.captureStream(30);
        const canvasTrack = canvasStream.getVideoTracks()[0];
        for(const key in connectionsRef.current){
            connectionsRef.current[key].addTrack(canvasTrack,canvasStream);
        }
        setSelfStream(canvasStream);
        setIsCanvasSharing(true);
    }

    // useEffect(()=>{
    //     if(isAdmin){
    //         shareWhiteboard();

    //     }
    // },[isAdmin])
    
    const shareWebcam = async()=>{
        const tempStream = await captureWebcam();
        
        for(const key in connectionsRef.current){
            tempStream.getTracks().forEach((track)=>{
                connectionsRef.current[key].addTrack(track,tempStream);
            });
        }
        setSelfStream(tempStream);
    }
    
    const selectQuestion=(questionID)=>{
        setSelectedQuestionID(questionID);
        messageInputRef.current.focus();
    } 
    const handleSubmit=(e)=>{
        e.preventDefault();
        socketRef.current.emit('join-room',{
            username:usernameInput,
            roomID:room
        });
        setIsJoinedRoom(true);
    }

    const handleInput=(e,setter)=>{
        setter(e.target.value);
    }
    const handleFileChange=()=>{
        const ctx = whiteboardRef.current.getContext("2d");
        const file = fileInputRef.current.files[0];
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload=(e)=>{
            if(e.target.readyState === FileReader.DONE){
                const img = new Image();
                img.src = e.target.result;
                img.onload=()=>{
                    ctx.drawImage(img,0,0,560,360);
                }
            }
        }
    }

    const sendMessages=(e)=>{
        e.preventDefault();
        if(messageInput.trim()===""){//if it was empty message 
            return;
        }
        const data={
            text:messageInput.trim(),
        }
        if(isAdmin){
            if(isQuestion){
                data.hardness=questionHardness;
            }
        }
        else{
            if(selectedQuestionID){
                data.repliedID=selectedQuestionID;
            }
        }
        socketRef.current.emit('chat', data);
        setMessageInput("");
        setSelectedQuestionID(null);
    }

    const rateMessage=(rate,messageID)=>{
        socketRef.current.emit('rate-message',{
            messageID:messageID,
            rate:rate
        })
    }
    

    const clearChat = ()=>{
        socketRef.current.emit('clear-chat');
    }
    
    useEffect(()=>{
        socketRef.current=io(SOCKET_ENDPOINT);
        socketRef.current.on('connect',()=>{
            console.log('socket connection established');
        }); 
        //TODO: reset all variables if socket disconnected (if needed)
        return()=>{
            socketRef.current.close();
        }
    },[]);

    useEffect(()=>{
        socketRef.current.on('new-user-joined',async({target,username})=>{ //start of peer A
            const newUser = new User(username,target);
            connectionsRef.current[target]=createPeer(target,username);
            setUsers((lastVal)=>{
                return [...lastVal,newUser]
            })
            if(selfStream){
                selfStream.getTracks().forEach((track)=>{
                    connectionsRef.current[target].addTrack(track,selfStream);
                });
            }
            else{
                const offer=await connectionsRef.current[target].createOffer();
                await connectionsRef.current[target].setLocalDescription(offer);
                socketRef.current.emit('offer',{
                    offer:connectionsRef.current[target].localDescription,
                    target:connectionsRef.current[target].target
                });
            }
        })
    },[selfStream]);

    useEffect(()=>{ 
        socketRef.current.on('chat',({sender,text,date,id,role,rate,hardness,repliedID})=>{
            const msg=new Message(id,sender,text,date,role,rate,hardness,repliedID);
            setChats(prev=>{
                return [...prev,msg]
            });
            messageContainerRef.current.scrollTop=10000;//scroll to button after new message
            
        });

        socketRef.current.on('self-info',(data)=>{
            if(data.isAdmin){
                setIsAdmin(true);
            }
            setSelfUsernameInRoom(data.username);
        })
        

        
        socketRef.current.on('full-chat-update',(chatsArr)=>{
            const dateCorrectedArr= chatsArr.map((chat)=>new Message(chat.id,chat.sender,chat.text,chat.date,chat.role,chat.rate,chat.hardness));
            setChats(()=>{
                return dateCorrectedArr;
            });
            if(dateCorrectedArr.length ===0){
                setSelectedQuestionID(null);
            }
        })

        socketRef.current.on('answer',async({answer,target})=>{
            await connectionsRef.current[target].setRemoteDescription(new RTCSessionDescription(answer));            
        })
        
        socketRef.current.on('offer',async({offer,target,username})=>{ //start of peer B
            const sdp= new RTCSessionDescription(offer);
            if(!connectionsRef.current[target]){
                connectionsRef.current[target]=createPeer(target,username);
                const newUser = new User(username,target);
                setUsers((lastVal)=>{
                    return [...lastVal,newUser]
                })
                
            }
            await connectionsRef.current[target].setRemoteDescription(sdp);
            const answer = await connectionsRef.current[target].createAnswer();
            await connectionsRef.current[target].setLocalDescription(answer);
            socketRef.current.emit('answer',{
                answer:answer,
                target:target
            });
            
        });

        socketRef.current.on("ice-candidate", ({incoming,target})=> {
            const candidate = new RTCIceCandidate(incoming);
            connectionsRef.current[target].addIceCandidate(candidate);
        });

        socketRef.current.on("user-disconnected",userSocketID=>{
            setStreams(lastVal=>{
                return lastVal.filter(stream=> stream.target !== userSocketID );
            });
            setUsers((lastVal)=>{
                console.log(lastVal);
                return lastVal.filter((user)=> user.connectionID !== userSocketID);
            });

        })
        

    },[]);
    
    useEffect(()=>{
        socketRef.current.on("update-message",(message)=>{
            // console.log('new message update');
            setChats((lastChats)=>{
                const index= lastChats.findIndex((chat)=>chat.id===message.id);

                if(index !== -1){
                    const newMsg={...lastChats[index]};
                    newMsg.rate=message.rate;
                    const newArr = [
                        ...lastChats.slice(0,index),
                        newMsg,
                        ...lastChats.slice(index+1)
                    ];
                    console.log(newArr);

                    return newArr;

                }
                return lastChats;

                
            })
        });
    },[]);




    return (
        <Paper square className="container">
            <div className="main">
                <form onSubmit={handleSubmit} className="formContainer">
                    <InputBase value={usernameInput} onChange={(e)=>{handleInput(e,setUsernameInput)}} required  placeholder="username..."/><br />
                    <InputBase value={room} onChange={(e)=>{handleInput(e,setRoom)}} required placeholder="room..."/>
                    <Button type="submit">Join</Button>
                </form>
                <div className="streamsContainer" style={{gridTemplateColumns:`repeat(${Math.floor(Math.log( (selfStream ? 1 : 0)+streams.length ===1 ? 1 : (selfStream ? 1 : 0)+streams.length ) /Math.log(2))+1}, minmax(0, 1fr))`}}>
                    <div className="vidContainer self whiteboardContainer" style={{display:isCanvasSharing? "flex" : "none"}}>
                        <canvas width="560" height="360" className="vid" id="whiteboard" ref={whiteboardRef} ></canvas>
                        <div className="buttonsContainer">
                            <Tooltip title="Insert Image" arrow>
                                <Button component="label">
                                    <ImageIcon />
                                    <input type="file" onChange={handleFileChange} ref={fileInputRef} hidden/>
                                </Button>
                            </Tooltip>

                            <Tooltip title="Line" arrow>
                                <Button className={selectedCanvasButton===0 ? "selected" : ""} onClick={()=>{setSelectedCanvasButton(0);removeEvents(whiteboardRef.current);drawLine(whiteboardRef.current); }}>
                                    <LineIcon />
                                </Button>     
                            </Tooltip>

                                                
                            <Tooltip title="Square" arrow>
                                <Button className={selectedCanvasButton===1 ? "selected" : ""} onClick={()=>{setSelectedCanvasButton(1);removeEvents(whiteboardRef.current);drawRect(whiteboardRef.current); }}>
                                    <SquareIcon />
                                </Button>                            
                            </Tooltip>
                            
                            <Tooltip title="Circle" arrow>
                                <Button className={selectedCanvasButton===2 ? "selected" : ""} onClick={()=>{setSelectedCanvasButton(2);removeEvents(whiteboardRef.current);drawCircle(whiteboardRef.current); }}>
                                    <CircleIcon />
                                </Button>
                            </Tooltip>

                            <Tooltip title="Text" arrow>
                                <Button className={selectedCanvasButton===3 ? "selected" : ""} onClick={()=>{setSelectedCanvasButton(3);removeEvents(whiteboardRef.current);drawText(whiteboardRef.current); }}>
                                    <TextIcon />
                                </Button>
                            </Tooltip>
                            
                            <Tooltip title="Draw" arrow>
                                <Button className={selectedCanvasButton===4 ? "selected" : ""} onClick={()=>{setSelectedCanvasButton(4);removeEvents(whiteboardRef.current);addDrawEvent(whiteboardRef.current); }}>
                                    <GestureIcon />
                                </Button>                            
                            </Tooltip>
                            <Button onClick={()=>{clearCanvas(whiteboardRef.current)}}>
                                Clear
                            </Button>
                            <ClickAwayListener onClickAway={()=>{setShowColorPicker(false)}} >
                                <div className="cp" >
                                    <Button onClick={()=>{setShowColorPicker(val=>!val)}}>
                                        <ColorIcon/>
                                    </Button>
                                        <div className={["colorPickerContainer",showColorPicker ? "show" : ""].join(" ")} >
                                            <BlockPicker color={pickedColor} width={170} onChangeComplete={setPickedColor} colors={colorsArr}/>
                                        </div>
                                </div>
                            </ClickAwayListener>
                            
                        </div>
                    </div> 
                    {
                        selfStream && ! isCanvasSharing &&
                        (<div className="vidContainer self">
                            <div className="username">You</div>
                            <video className="vid" ref={elem=>{if(elem) return elem.srcObject = selfStream}} muted autoPlay playsInline></video> 
                        </div>)
                    }
                    {
                        streams.map(({stream,username})=>{
                            
                            return (
                                <div className="vidContainer" key={stream.id}>
                                    <div className="username">{username} </div>
                                    <video className="vid"  ref={elem=>{if(elem) return elem.srcObject=stream}} muted autoPlay playsInline></video>
                                </div>                    
                            )
                        })
                    } 
                </div>
                
            </div>
            <Paper square className={classes.sidebar}>
                <div className="users">
                    <List 
                        subheader={<ListSubheader component="div" className="listHeader">Users {users.length > 0 ? `(${users.length+1})` : ""}</ListSubheader>}
                        style={{maxHeight:"300px",overflowY:"scroll",}}
                        
                    >
                        {
                            isJoinedRoom && 
                            <ListItem>
                                <ListItemText className="selfUserContainer" primary={<Typography component="div">{selfUsernameInRoom} <span className="caption"> &nbsp; You</span> </Typography>} />
                            </ListItem>
                        }
                        {
                            users.map((user)=>{
                                return (
                                    <ListItem key={user.connectionID}>
                                        <ListItemText primary={user.username}/>
                                    </ListItem>
                                )
                            })
                        }                       
                    </List>
                </div>    
                <Divider />            
                <div className="messages" ref={messageContainerRef}>
                    <List 
                        subheader={<ListSubheader className="listHeader" component="div">CHAT {chats.length>0 ? `(${chats.length})` : ""}</ListSubheader>}
                        disablePadding
                    >
                        {
                            chats.map((chat)=>{
                                let role=chat.role;
                                let onClick=null;
                                let repliedText=chats.filter((elem)=>elem.id===chat.repliedID)[0]?.text;
                                if(role==="question"){
                                    onClick=()=>{
                                        selectQuestion(chat.id)
                                    }
                                }
                                const ratingOnChange=(value)=>{
                                    rateMessage(value,chat.id);
                                }

                                return (
                                    <ChatListItem key={chat.id} id={chat.id} rate={chat.rate} ratingOnChange={ratingOnChange} sender={chat.sender} repliedText={repliedText} hardness={chat.hardness} role={role} onClick={onClick} text={chat.text} date={chat.date} isAdmin={isAdmin} />
                                )
                            })
                        }
                    </List>
                </div>
                <Divider />
                {
                    !isAdmin && selectedQuestionID &&
                    (
                        <div className="replyContainer">
                            <span onClick={()=>{setSelectedQuestionID(null)}}><CloseIcon /></span>
                            Question: &nbsp;
                            {
                                chats.filter((chat)=>chat.id===selectedQuestionID)[0]?.text
                            }
                        </div>
                    )
                }
                {
                    isAdmin && 
                    (
                        <div className="msgMode">
                            <Button variant="outlined" onClick={()=>{setIsQuestion(true)}} >Question {isQuestion ? <TickIcon /> : ""} </Button>
                            <Button variant="outlined" onClick={()=>{setIsQuestion(false)}} >Message {!isQuestion ? <TickIcon /> : "" } </Button>
                            {
                                isQuestion &&
                                (<InputBase 
                                    type="number" 
                                    startAdornment={<InputAdornment position="start" component="label">Hardness: </InputAdornment>}
                                    inputProps={{min:0,max:10}}
                                    onChange={(e)=>{setQuestionHardness(e.target.value)}}
                                    value={questionHardness}
                                />)
                            }
                        </div>
                    )
                }
                <form className="form" onSubmit={sendMessages}>
                    <InputBase
                        className="input"
                        placeholder={selectedQuestionID ? "Reply..." :"Message..." }
                        value={messageInput}
                        onChange={(e)=>{setMessageInput(e.target.value)}}
                        variant="outlined"
                        inputProps={{
                            ref:messageInputRef
                        }}
                    />
                    <IconButton type="submit" aria-label="Send Message">
                        <MessageIcon/>
                    </IconButton>
                </form>
            </Paper>
            <Paper
                className={classes.nav}
            >
                <IconButton 
                    onClick={()=>{toggleStreamTrack(selfStream,'audio',micIsSharing);setMicIsSharing(!micIsSharing)}}
                    aria-label="Share Microphone"
                >
                    { micIsSharing ? <MicrophoneIcon /> : <MicrophoneDisableIcon/> }
                </IconButton>                
                
                <IconButton 
                    onClick={()=>{toggleStreamTrack(selfStream,'video',desktopIsSharing);setDesktopIsSharing(!desktopIsSharing)}}
                    aria-label="Share Desktop" 
                >
                    {desktopIsSharing ? <DesktopIcon /> : <DesktopDesableIcon/>}
                </IconButton>                    
                
                <Button onClick={shareWebcam}>
                    Share webcam
                </Button>
                <Button onClick={shareDesktop}>
                    Share Desktop
                </Button>
                <Button onClick={shareWhiteboard}>
                    Create Whiteboard
                </Button>
                {
                    isAdmin &&
                    (<Button onClick={clearChat}>
                        clear chat
                    </Button>)
                }
                {/* <IconButton onClick={()=>{props.setDarkTheme(!props.darkTheme)}} aria-label="theme">
                    { props.darkTheme ? <SunIcon/> : <MoonIcon /> } 
                </IconButton>                */}

                {/* <IconButton ref={hangupBtnRef} aria-label="hangup" className="bgRed" >
                    <HangupIcon />
                </IconButton> */}
            </Paper>

        </Paper>
    )
}


    // const toggleMic=(enable)=>{
    //     desktopStream.getAudioTracks()[0].enabled = enable;
    //     setMicIsOn(enable);
    // }
    
    // const mixScreenAudio=(enable)=>{//will mix audio with shared desktop
    //     if(enable){
    //         captureScreen()
    //         .then((stream)=>{
    //             captureMic()
    //             .then(micStream=>{
    //                 stream.addTrack(micStream.getAudioTracks()[0])
    //                 screenVidRef.current.srcObject=stream;
    //                 setDesktopStream(stream);
    //                 setDesktopIsSharing(true);
    //             })
    //             .catch(()=>{
    //                 console.error(`Error happens capturing micrphone`);
    //             })
    //         })
    //         .catch(()=>{
    //             console.error(`Error happens capturing desktop`)
    //         })
    //     }
    //     else{
    //         stopCapture(screenVidRef.current);
    //         setDesktopIsSharing(false);
    //         setDesktopStream(null);
    //         setMicIsOn(true);
    //     }
    // }

    //

// const stopCapture=(vidElem)=>{
//     let tracks = vidElem.srcObject.getTracks();
//     tracks.forEach(track => track.stop());
//     vidElem.srcObject = null;
// }

// const captureMic=()=> {
//     return new Promise((resolve,reject) => {
//         navigator.mediaDevices.getUserMedia({audio:true})
//         .then(currentStream=>{
//             resolve(currentStream);
//         })
//         .catch(() =>{
//             reject();
//         })
//     });
// }